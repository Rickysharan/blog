import AppKit
import Foundation
import WebKit

enum StudioWriterCategory: String, CaseIterable {
    case anime, movies, politics, sports, finance
    case shareMarket = "share-market"
}

enum StudioBridgeCommand: Equatable {
    case write(category: String, requestId: String)
    case cancel(requestId: String)
    case refresh(requestId: String)
}

final class StudioBridgePolicy {
    static let categories = Set(StudioWriterCategory.allCases.map(\.rawValue))
    private let configuration: StudioConfiguration
    private let start: (StudioBridgeCommand) -> Void
    private let reject: (String) -> Void

    init(configuration: StudioConfiguration, start: @escaping (StudioBridgeCommand) -> Void, reject: @escaping (String) -> Void) {
        self.configuration = configuration
        self.start = start
        self.reject = reject
    }

    @discardableResult
    func handle(body: Any, sourceURL: URL?, isMainFrame: Bool, hasUserActivation: Bool) -> Bool {
        guard let sourceURL, configuration.allows(url: sourceURL) else { return denied("rejected-origin") }
        guard isMainFrame else { return denied("rejected-frame") }
        guard hasUserActivation else { return denied("rejected-user-activation") }
        guard let body = body as? [String: Any], let action = body["action"] as? String else { return denied("rejected-message") }
        guard ["write", "cancel", "refresh"].contains(action) else { return denied("rejected-action") }
        let allowedKeys: Set<String> = action == "write" ? ["action", "category", "requestId"] : ["action", "requestId"]
        guard Set(body.keys) == allowedKeys else { return denied("rejected-message") }
        guard let requestId = body["requestId"] as? String, Self.validRequestId(requestId) else { return denied("rejected-request-id") }
        switch action {
        case "write":
            guard let category = body["category"] as? String, Self.categories.contains(category) else { return denied("rejected-category") }
            start(.write(category: category, requestId: requestId))
        case "cancel": start(.cancel(requestId: requestId))
        default: start(.refresh(requestId: requestId))
        }
        return true
    }

    private func denied(_ reason: String) -> Bool { reject(reason); return false }

    private static func validRequestId(_ value: String) -> Bool {
        guard (8...128).contains(value.count) else { return false }
        let allowed = Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-".utf8)
        return value.utf8.allSatisfy(allowed.contains)
    }
}

final class StudioAuditLog {
    private let url: URL
    private let lock = NSLock()

    init(projectPath: String) {
        url = URL(fileURLWithPath: projectPath).appendingPathComponent(".audit/desktop-writer.log")
    }

    func append(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }
        append(data)
    }

    func append(_ data: Data) {
        lock.lock()
        defer { lock.unlock() }
        try? FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: nil, attributes: [.posixPermissions: 0o600])
        }
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        guard let handle = try? FileHandle(forWritingTo: url) else { return }
        defer { try? handle.close() }
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: data)
    }
}

struct StudioStatusSanitizer {
    func status(from event: [String: Any], elapsed: Int, estimatedDuration: Int) -> [String: Any]? {
        let phase = (event["stage"] as? String) ?? (event["phase"] as? String)
        guard let phase, phase.range(of: "^[a-z][a-z0-9-]{0,63}$", options: .regularExpression) != nil else { return nil }
        let rawProgress = event["percent"] as? Int ?? event["progress"] as? Int ?? 0
        let progress = min(100, max(0, rawProgress))
        let eventStatus = event["status"] as? String
        let terminalError = ["failed", "human-required", "cancelled"].contains(eventStatus ?? "")
        let completed = eventStatus == "completed"
        let verifiedDelivery = completed && event["deliveryStatus"] as? String == "delivered"
        let terminal = terminalError || completed
        let delivery = terminal ? (verifiedDelivery ? "delivered" : "not-delivered") : "pending"
        let hasError = terminal && !verifiedDelivery
        let eta: Any
        if verifiedDelivery { eta = 0 }
        else if hasError { eta = NSNull() }
        else { eta = max(0, estimatedDuration - elapsed) }
        return [
            "phase": phase,
            "progress": progress,
            "etaSeconds": eta,
            "delivery": delivery,
            "error": hasError ? (completed ? "Writing finished, but delivery was not verified. Try again." : "Writing needs attention. Try again.") : NSNull(),
        ]
    }

    func isTerminal(_ event: [String: Any]) -> Bool {
        ["completed", "failed", "human-required", "cancelled"].contains(event["status"] as? String ?? "")
    }
}

final class StudioWriterAdmission {
    private(set) var activeCategory: String?
    private(set) var activeRequestId: String?

    func begin(category: String, requestId: String) -> Bool {
        guard activeRequestId == nil else { return false }
        activeCategory = category
        activeRequestId = requestId
        return true
    }

    @discardableResult
    func finish(requestId: String) -> Bool {
        guard requestId == activeRequestId else { return false }
        activeCategory = nil
        activeRequestId = nil
        return true
    }
}

final class LocalWriterController {
    private let configuration: StudioConfiguration
    private let statusSink: ([String: Any]) -> Void
    private let sanitizer = StudioStatusSanitizer()
    private let admission = StudioWriterAdmission()
    private let auditLog: StudioAuditLog
    private let outputLock = NSLock()
    private var process: Process?
    private var pipe: Pipe?
    private var outputBuffer = Data()
    private var outputFinished = false
    private var category: String?
    private var requestId: String?
    private var startedAt = Date()
    private var receivedTerminalEvent = false

    init(configuration: StudioConfiguration, statusSink: @escaping ([String: Any]) -> Void) {
        self.configuration = configuration
        self.statusSink = statusSink
        self.auditLog = StudioAuditLog(projectPath: configuration.projectPath)
    }

    func perform(_ command: StudioBridgeCommand) {
        switch command {
        case let .write(category, requestId): start(category: category, requestId: requestId)
        case let .cancel(requestId): cancel(requestId: requestId)
        case .refresh: break
        }
    }

    func shutdown() {
        if let requestId = admission.activeRequestId { cancel(requestId: requestId) }
    }

    private func start(category: String, requestId: String) {
        guard admission.begin(category: category, requestId: requestId) else {
            emit(
                ["phase": "already-running", "progress": 0, "etaSeconds": NSNull(), "delivery": "not-delivered", "error": "One article is already being written."],
                category: category,
                requestId: requestId
            )
            return
        }
        self.category = category
        self.requestId = requestId
        startedAt = Date()
        outputLock.lock()
        receivedTerminalEvent = false
        outputFinished = false
        outputBuffer = Data()
        outputLock.unlock()
        appendAudit("\n--- writer request started ---\n")

        let task = Process()
        let output = Pipe()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        task.arguments = [URL(fileURLWithPath: configuration.projectPath).appendingPathComponent("Start OmniLede.command").path]
        task.currentDirectoryURL = URL(fileURLWithPath: configuration.projectPath)
        var environment = ProcessInfo.processInfo.environment
        environment["OMNILEDE_ACTION"] = "write"
        environment["OMNILEDE_CATEGORY"] = category
        environment["OMNILEDE_START_NEW"] = "true"
        environment["OMNILEDE_DESKTOP"] = "true"
        task.environment = environment
        task.standardOutput = output
        task.standardError = output
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            self?.readAvailableOutput(handle, category: category, requestId: requestId)
        }
        task.terminationHandler = { [weak self] finished in
            self?.drainAndFinish(process: finished, output: output, category: category, requestId: requestId)
        }
        process = task
        pipe = output
        do {
            try task.run()
            emit(["phase": "starting", "progress": 0, "etaSeconds": 90, "delivery": "pending", "error": NSNull()])
        } catch {
            appendAudit("launcher-error \(String(describing: error))\n")
            process = nil
            pipe = nil
            _ = admission.finish(requestId: requestId)
            emit(["phase": "failed", "progress": 0, "etaSeconds": NSNull(), "delivery": "not-delivered", "error": "The local writer could not start. Try again."])
        }
    }

    private func cancel(requestId: String) {
        guard requestId == admission.activeRequestId, let process, process.isRunning else { return }
        process.terminate()
    }

    private func readAvailableOutput(_ handle: FileHandle, category: String, requestId: String) {
        outputLock.lock()
        defer { outputLock.unlock() }
        guard !outputFinished else { return }
        let data = handle.availableData
        guard !data.isEmpty else { handle.readabilityHandler = nil; return }
        consumeLocked(data, category: category, requestId: requestId, flush: false)
    }

    private func consumeLocked(_ data: Data, category: String, requestId: String, flush: Bool) {
        appendAudit(data)
        outputBuffer.append(data)
        var lines: [Data] = []
        while let newline = outputBuffer.firstIndex(of: 0x0A) {
            lines.append(outputBuffer.prefix(upTo: newline))
            outputBuffer.removeSubrange(...newline)
        }
        if flush, !outputBuffer.isEmpty {
            lines.append(outputBuffer)
            outputBuffer.removeAll(keepingCapacity: false)
        }
        for lineData in lines {
            guard !receivedTerminalEvent else { continue }
            let line = String(decoding: lineData, as: UTF8.self)
            guard line.hasPrefix("@omnilede ") else { continue }
            let raw = String(line.dropFirst("@omnilede ".count))
            guard let eventData = raw.data(using: .utf8),
                  let event = try? JSONSerialization.jsonObject(with: eventData) as? [String: Any],
                  let safe = sanitizer.status(from: event, elapsed: Int(Date().timeIntervalSince(startedAt)), estimatedDuration: 90)
            else { continue }
            if sanitizer.isTerminal(event) { receivedTerminalEvent = true }
            DispatchQueue.main.async { [weak self] in
                guard let self, admission.activeRequestId == requestId, admission.activeCategory == category else { return }
                emit(safe, category: category, requestId: requestId)
            }
        }
    }

    private func drainAndFinish(process finishedProcess: Process, output: Pipe, category: String, requestId: String) {
        output.fileHandleForReading.readabilityHandler = nil
        outputLock.lock()
        if !outputFinished {
            let remaining = output.fileHandleForReading.readDataToEndOfFile()
            consumeLocked(remaining, category: category, requestId: requestId, flush: true)
            outputFinished = true
        }
        let hadTerminalEvent = receivedTerminalEvent
        outputLock.unlock()
        DispatchQueue.main.async { [weak self] in
            self?.finished(process: finishedProcess, category: category, requestId: requestId, hadTerminalEvent: hadTerminalEvent)
        }
    }

    private func finished(process finishedProcess: Process, category: String, requestId: String, hadTerminalEvent: Bool) {
        guard let activeProcess = process, activeProcess === finishedProcess else { return }
        pipe?.fileHandleForReading.readabilityHandler = nil
        process = nil
        pipe = nil
        _ = admission.finish(requestId: requestId)
        if !hadTerminalEvent {
            emit(
                ["phase": "delivery-unverified", "progress": 100, "etaSeconds": NSNull(), "delivery": "not-delivered", "error": "Writing finished, but delivery was not verified. Try again."],
                category: category,
                requestId: requestId
            )
        }
        self.category = nil
        self.requestId = nil
        appendAudit("--- writer request finished (\(finishedProcess.terminationStatus)) ---\n")
    }

    private func emit(_ status: [String: Any]) {
        guard let category, let requestId else { return }
        emit(status, category: category, requestId: requestId)
    }

    private func emit(_ status: [String: Any], category: String, requestId: String) {
        var payload = status
        payload["category"] = category
        payload["requestId"] = requestId
        statusSink(payload)
    }

    private func appendAudit(_ text: String) { auditLog.append(text) }
    private func appendAudit(_ data: Data) { auditLog.append(data) }
}

struct StudioPlanSanitizer {
    func payload(snapshot: DailyPlanSnapshot, requestId: String) -> [String: Any]? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let date = formatter.date(from: snapshot.date), formatter.string(from: date) == snapshot.date,
              snapshot.totalTasks == 3, snapshot.tasks.count == 3,
              (0...3).contains(snapshot.completedCount), snapshot.draftCount >= 0, snapshot.publishedCount >= 0
        else { return nil }
        var categories = Set<String>()
        var tasks: [[String: Any]] = []
        for task in snapshot.tasks {
            guard StudioBridgePolicy.categories.contains(task.category), categories.insert(task.category).inserted,
                  (1...80).contains(task.label.count), (1...300).contains(task.reason.count),
                  task.label.rangeOfCharacter(from: .controlCharacters) == nil,
                  task.reason.rangeOfCharacter(from: .controlCharacters) == nil
            else { return nil }
            tasks.append(["category": task.category, "label": task.label, "reason": task.reason, "status": task.status.rawValue])
        }
        return [
            "requestId": requestId, "date": snapshot.date,
            "completedCount": snapshot.completedCount, "totalTasks": 3,
            "draftCount": snapshot.draftCount, "publishedCount": snapshot.publishedCount,
            "tasks": tasks,
        ]
    }
}

final class LocalPlannerController {
    private let configuration: StudioConfiguration
    private let sink: ([String: Any]) -> Void
    private let auditLog: StudioAuditLog
    private let lock = NSLock()
    private var process: Process?
    private var output = Data()
    private var overflowed = false

    init(configuration: StudioConfiguration, sink: @escaping ([String: Any]) -> Void) {
        self.configuration = configuration
        self.sink = sink
        self.auditLog = StudioAuditLog(projectPath: configuration.projectPath)
    }

    func refresh(requestId: String) {
        guard process?.isRunning != true else { return }
        output = Data()
        overflowed = false
        let task = Process()
        let pipe = Pipe()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        task.arguments = [URL(fileURLWithPath: configuration.projectPath).appendingPathComponent("Start OmniLede.command").path]
        task.currentDirectoryURL = URL(fileURLWithPath: configuration.projectPath)
        var environment = ProcessInfo.processInfo.environment
        environment["OMNILEDE_ACTION"] = "plan-snapshot"
        environment["OMNILEDE_PLAN_DATE"] = Self.localDate()
        task.environment = environment
        task.standardOutput = pipe
        task.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in self?.read(handle) }
        task.terminationHandler = { [weak self] finished in self?.finish(finished, pipe: pipe, requestId: requestId) }
        process = task
        do { try task.run() }
        catch {
            process = nil
            auditLog.append("planner-launch-error\n")
        }
    }

    func shutdown() { if process?.isRunning == true { process?.terminate() } }

    private static func localDate() -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    private func read(_ handle: FileHandle) {
        lock.lock()
        defer { lock.unlock() }
        let data = handle.availableData
        guard !data.isEmpty else { handle.readabilityHandler = nil; return }
        auditLog.append(data)
        if output.count + data.count <= 262_144 { output.append(data) } else { overflowed = true }
    }

    private func finish(_ finished: Process, pipe: Pipe, requestId: String) {
        pipe.fileHandleForReading.readabilityHandler = nil
        lock.lock()
        let remaining = pipe.fileHandleForReading.readDataToEndOfFile()
        auditLog.append(remaining)
        if output.count + remaining.count <= 262_144 { output.append(remaining) } else { overflowed = true }
        let bytes = output
        let invalid = overflowed
        lock.unlock()
        var payload: [String: Any]?
        if !invalid {
            for line in String(decoding: bytes, as: UTF8.self).split(separator: "\n", omittingEmptySubsequences: true) {
                guard line.hasPrefix("@omnilede-plan ") else { continue }
                let raw = String(line.dropFirst("@omnilede-plan ".count))
                guard let data = raw.data(using: .utf8), let snapshot = try? JSONDecoder().decode(DailyPlanSnapshot.self, from: data) else { continue }
                payload = StudioPlanSanitizer().payload(snapshot: snapshot, requestId: requestId)
            }
        }
        DispatchQueue.main.async { [weak self] in
            guard let self, process === finished else { return }
            process = nil
            if finished.terminationStatus == 0, let payload { sink(payload) }
        }
    }
}

final class StudioBridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    private let policy: StudioBridgePolicy
    private let writer: LocalWriterController
    private let planner: LocalPlannerController

    init(configuration: StudioConfiguration) {
        let auditLog = StudioAuditLog(projectPath: configuration.projectPath)
        let controller = LocalWriterController(configuration: configuration) { payload in
            guard JSONSerialization.isValidJSONObject(payload),
                  let data = try? JSONSerialization.data(withJSONObject: payload),
                  let json = String(data: data, encoding: .utf8)
            else { return }
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .omniledeNativeStatus, object: json)
            }
        }
        let planner = LocalPlannerController(configuration: configuration) { payload in
            guard JSONSerialization.isValidJSONObject(payload),
                  let data = try? JSONSerialization.data(withJSONObject: payload),
                  let json = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .omniledeNativePlan, object: json)
            }
        }
        self.writer = controller
        self.planner = planner
        self.policy = StudioBridgePolicy(configuration: configuration, start: { command in
            if case let .refresh(requestId) = command { planner.refresh(requestId: requestId) }
            else { controller.perform(command) }
        }) { reason in
            auditLog.append("bridge-rejection \(reason)\n")
        }
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(statusNotification(_:)), name: .omniledeNativeStatus, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(planNotification(_:)), name: .omniledeNativePlan, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        writer.shutdown()
        planner.shutdown()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let webView else { return }
        let action = (message.body as? [String: Any])?["action"] as? String ?? ""
        let category = (message.body as? [String: Any])?["category"] as? String ?? ""
        guard let expectedData = try? JSONSerialization.data(withJSONObject: ["action": action, "category": category]),
              let expected = String(data: expectedData, encoding: .utf8) else { return }
        let activationCheck = """
        (() => {
          const expected = \(expected);
          const button = document.activeElement;
          if (!(button instanceof HTMLButtonElement)) return false;
          const rect = button.getBoundingClientRect();
          return document.visibilityState === 'visible'
            && document.hasFocus()
            && navigator.userActivation.isActive === true
            && button.dataset.omniledeNativeAction === expected.action
            && (expected.action !== 'write' || button.dataset.omniledeCategory === expected.category)
            && rect.width > 0 && rect.height > 0;
        })()
        """
        webView.evaluateJavaScript(activationCheck) { [weak self] result, _ in
            guard let self else { return }
            _ = policy.handle(body: message.body, sourceURL: message.frameInfo.request.url, isMainFrame: message.frameInfo.isMainFrame, hasUserActivation: result as? Bool == true)
        }
    }

    @objc private func statusNotification(_ notification: Notification) {
        guard let json = notification.object as? String else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('omnilede:native-status',{detail:\(json)}));")
    }

    @objc private func planNotification(_ notification: Notification) {
        guard let json = notification.object as? String else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('omnilede:native-plan',{detail:\(json)}));")
    }

    func shutdown() { writer.shutdown(); planner.shutdown() }
}

extension Notification.Name {
    static let omniledeNativeStatus = Notification.Name("omnilede-native-status")
    static let omniledeNativePlan = Notification.Name("omnilede-native-plan")
}
