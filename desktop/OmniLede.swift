import AppKit

final class WriterApp: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let title = NSTextField(labelWithString: "OmniLede")
    let status = NSTextField(wrappingLabelWithString: "Getting ready…")
    let time = NSTextField(labelWithString: "")
    let detail = NSTextField(wrappingLabelWithString: "Articles stay as drafts until you click Publish.")
    let repairsLabel = NSTextField(wrappingLabelWithString: "")
    let bar = NSProgressIndicator()
    let dashboard = NSButton(title: "Open review dashboard", target: nil, action: nil)
    let resume = NSButton(title: "Try again", target: nil, action: nil)
    let startNew = NSButton(title: "Start a new article", target: nil, action: nil)
    let cancel = NSButton(title: "Cancel", target: nil, action: nil)

    var task: Process?
    var pipe: Pipe?
    var timer: Timer?
    var began = Date()
    var buffer = ""
    var finished = false
    var delivered = false
    var cancelledByUser = false
    var resumableFailure = false
    var photoCount: Int?
    var estimateExtension = 0
    var dashboardURL: URL?
    var lastTerminalMessage = ""
    var repairMessages: [String] = []
    var isSmokeTesting = false
    var repo: String { Bundle.main.object(forInfoDictionaryKey: "OmniLedeProjectPath") as? String ?? "" }

    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 600, height: 470),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "OmniLede — Local Writer"
        window.center()
        title.font = .systemFont(ofSize: 30, weight: .bold)
        status.font = .systemFont(ofSize: 17, weight: .medium)
        time.textColor = .secondaryLabelColor
        detail.textColor = .secondaryLabelColor
        repairsLabel.textColor = .secondaryLabelColor
        repairsLabel.font = .systemFont(ofSize: 12)
        bar.style = .bar
        bar.isIndeterminate = false
        bar.minValue = 0
        bar.maxValue = 100

        dashboard.target = self
        dashboard.action = #selector(openDashboard)
        dashboard.bezelStyle = .rounded
        dashboard.isEnabled = false
        resume.target = self
        resume.action = #selector(start)
        resume.bezelStyle = .rounded
        resume.isHidden = true
        startNew.target = self
        startNew.action = #selector(start)
        startNew.bezelStyle = .rounded
        startNew.isHidden = true
        cancel.target = self
        cancel.action = #selector(cancelRun)
        cancel.bezelStyle = .rounded
        cancel.isHidden = true

        let actionRow = NSStackView(views: [dashboard, resume, startNew, cancel])
        actionRow.orientation = .horizontal
        actionRow.spacing = 10
        let stack = NSStackView(views: [title, status, bar, time, detail, repairsLabel, actionRow])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 30),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -30),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 26),
            bar.widthAnchor.constraint(equalTo: stack.widthAnchor),
            status.widthAnchor.constraint(equalTo: stack.widthAnchor),
            detail.widthAnchor.constraint(equalTo: stack.widthAnchor),
            repairsLabel.widthAnchor.constraint(equalTo: stack.widthAnchor)
        ])
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--smoke-test") {
            isSmokeTesting = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.smokeTest() }
            return
        }
        #endif
        start()
    }

    @objc func start() {
        guard task?.isRunning != true else { return }
        finished = false
        delivered = false
        cancelledByUser = false
        resumableFailure = false
        photoCount = nil
        estimateExtension = 0
        buffer = ""
        began = Date()
        lastTerminalMessage = ""
        repairMessages = []
        repairsLabel.stringValue = ""
        resume.isHidden = true
        startNew.isHidden = true
        cancel.isHidden = false
        cancel.isEnabled = true
        dashboard.isEnabled = false
        bar.doubleValue = 3
        status.stringValue = "Starting your local writer…"
        detail.stringValue = "Progress follows completed steps. You can minimise this window."

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [repo + "/Start OmniLede.command"]
        process.currentDirectoryURL = URL(fileURLWithPath: repo)
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        env["OMNILEDE_DESKTOP"] = "true"
        process.environment = env
        let output = Pipe()
        process.standardOutput = output
        process.standardError = output
        pipe = output
        task = process
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                handle.readabilityHandler = nil
                return
            }
            let text = String(decoding: data, as: UTF8.self)
            DispatchQueue.main.async { self?.consume(text) }
        }
        process.terminationHandler = { [weak self] process in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                self?.end(code: process.terminationStatus)
            }
        }
        do {
            try process.run()
            timer?.invalidate()
            timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                self?.tick()
            }
            tick()
        } catch {
            finished = true
            cancel.isHidden = true
            status.stringValue = "Could not start the local writer."
            detail.stringValue = "The project launcher could not start. Reinstall OmniLede.app from this project folder."
            resume.isHidden = false
        }
    }

    @objc func cancelRun() {
        guard let running = task, running.isRunning else { return }
        cancelledByUser = true
        cancel.isEnabled = false
        status.stringValue = "Stopping safely…"
        detail.stringValue = "Completed drafts and resume state will stay on this Mac."
        pipe?.fileHandleForReading.readabilityHandler = nil
        running.terminate()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak running] in
            if running?.isRunning == true { running?.interrupt() }
        }
    }

    private func safeDashboardURL(_ raw: String) -> URL? {
        guard let url = URL(string: raw) else { return nil }
        if url.scheme == "https" && url.user == nil && url.password == nil { return url }
        if url.scheme == "http" && url.host == "127.0.0.1" && url.user == nil && url.password == nil { return url }
        return nil
    }

    private func showRepairs() {
        let unique = repairMessages.reduce(into: [String]()) { result, repair in
            if !result.contains(repair) { result.append(repair) }
        }
        repairMessages = unique
        repairsLabel.stringValue = unique.isEmpty ? "" : "Automatic repairs:\n• " + unique.joined(separator: "\n• ")
    }

    func consume(_ text: String) {
        buffer += text
        while let range = buffer.range(of: "\n") {
            let line = String(buffer[..<range.lowerBound])
            buffer.removeSubrange(..<range.upperBound)
            guard line.hasPrefix("@omnilede "),
                  let data = String(line.dropFirst(10)).data(using: .utf8),
                  let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                continue
            }

            if event["phase"] as? String == "dashboard",
               let raw = event["url"] as? String,
               let url = safeDashboardURL(raw) {
                dashboardURL = url
                dashboard.isEnabled = delivered
                if delivered {
                    if !isSmokeTesting { openDashboard() }
                    finishDisplay()
                }
                continue
            }

            if let count = event["imageCount"] as? Int { photoCount = count }
            if let percent = event["percent"] as? Double { bar.doubleValue = percent }
            if let percent = event["percent"] as? Int { bar.doubleValue = Double(percent) }
            if let message = event["message"] as? String { status.stringValue = message }
            if let repairs = event["repairs"] as? [String] { repairMessages.append(contentsOf: repairs) }

            let eventStatus = event["status"] as? String ?? ""
            if eventStatus == "repaired", let message = event["message"] as? String {
                repairMessages.append(message)
                detail.stringValue = message
                showRepairs()
            } else if eventStatus == "retrying" {
                estimateExtension += 30
                if let message = event["message"] as? String { detail.stringValue = message }
                tick()
            } else if eventStatus == "human-required" || eventStatus == "failed" {
                lastTerminalMessage = event["message"] as? String ?? "The run needs attention."
                resumableFailure = event["draftRef"] != nil
                detail.stringValue = lastTerminalMessage
            } else if eventStatus == "cancelled" {
                lastTerminalMessage = event["message"] as? String ?? "Completed work is safe and resumable."
                resumableFailure = true
            } else if eventStatus == "completed" && event["deliveryStatus"] as? String == "delivered" {
                delivered = true
                resumableFailure = false
                showRepairs()
                finishDisplay()
            }
        }
    }

    func tick() {
        guard !finished else { return }
        let elapsed = Int(Date().timeIntervalSince(began))
        let prior = UserDefaults.standard.double(forKey: "lastSuccessfulDuration")
        let baseEstimate = prior > 0 ? max(20, Int(prior)) : 90
        let estimate = baseEstimate + estimateExtension
        let remaining = estimate - elapsed
        if remaining > 0 {
            let suffix = estimateExtension > 0 ? " (adjusted after retry)" : " (estimate)"
            time.stringValue = "Elapsed: \(elapsed)s · About \(remaining)s remaining\(suffix)"
        } else {
            time.stringValue = "Elapsed: \(elapsed)s · Taking longer than estimated; still working…"
        }
    }

    func finishDisplay() {
        guard !finished else {
            dashboard.isEnabled = delivered && dashboardURL != nil
            return
        }
        finished = true
        timer?.invalidate()
        bar.doubleValue = 100
        cancel.isHidden = true
        let seconds = Int(Date().timeIntervalSince(began))
        if delivered { UserDefaults.standard.set(seconds, forKey: "lastSuccessfulDuration") }
        time.stringValue = "Completed in \(seconds) seconds"
        let photos = photoCount.map { "\($0)/3 related photos included. " } ?? ""
        detail.stringValue = photos + "Select your draft in the dashboard, check the text and pictures, then click Publish. Sign in there if asked."
        dashboard.isEnabled = delivered && dashboardURL != nil
        resume.isHidden = true
        startNew.isHidden = false
        startNew.isEnabled = true
        showRepairs()
    }

    func end(code: Int32) {
        task = nil
        pipe?.fileHandleForReading.readabilityHandler = nil
        cancel.isHidden = true
        timer?.invalidate()
        if code == 0 && delivered {
            finishDisplay()
            return
        }

        finished = true
        time.stringValue = "Stopped after \(Int(Date().timeIntervalSince(began))) seconds"
        if cancelledByUser {
            status.stringValue = "Cancelled — your work is safe."
            detail.stringValue = "Use Try again to resume from the last completed step."
            resumableFailure = true
        } else {
            status.stringValue = "Your article needs attention."
            detail.stringValue = lastTerminalMessage.isEmpty
                ? "Writing or delivery could not finish. Your existing drafts are safe. Try again; technical details are in .audit/desktop-writer.log."
                : lastTerminalMessage
        }
        resume.title = "Try again"
        resume.isHidden = false
        startNew.isHidden = false
        startNew.isEnabled = !resumableFailure
        startNew.toolTip = resumableFailure
            ? "Resume the saved article first so it is not abandoned."
            : "Write a different article from the latest queue."
        showRepairs()
    }

    #if DEBUG
    func smokeTest() {
        func buttons(in view: NSView) -> [NSButton] {
            let own = view as? NSButton
            return (own.map { [$0] } ?? []) + view.subviews.flatMap { buttons(in: $0) }
        }
        let buttonTitles = buttons(in: window.contentView!).map(\.title)
        precondition(buttonTitles.contains("Cancel"))
        precondition(buttonTitles.contains("Start a new article"))

        consume("@omnilede {\"runId\":\"smoke\",\"stage\":\"preflight\",\"attempt\":1,\"percent\":5,\"status\":\"repaired\",\"message\":\"Ollama stopped; restarted locally (1/2)\",\"imageCount\":0,\"repairs\":[\"Ollama stopped; restarted locally (1/2)\"]}\n")
        precondition(detail.stringValue.contains("restarted locally"))
        consume("@omnilede {\"runId\":\"smoke\",\"stage\":\"generation\",\"attempt\":2,\"percent\":35,\"status\":\"retrying\",\"message\":\"The draft needed correction; regenerating from the original source.\",\"imageCount\":0,\"repairs\":[],\"errorCategory\":\"generation-invalid\"}\n")
        precondition(bar.doubleValue == 35)
        tick()
        precondition(time.stringValue.contains("adjusted"))

        let sleeper = Process()
        sleeper.executableURL = URL(fileURLWithPath: "/bin/sleep")
        sleeper.arguments = ["5"]
        try! sleeper.run()
        task = sleeper
        cancel.isHidden = false
        cancel.isEnabled = true
        cancel.performClick(nil)
        sleeper.waitUntilExit()
        precondition(!sleeper.isRunning)

        cancelledByUser = false
        consume("@omnilede {\"runId\":\"smoke\",\"stage\":\"dashboard-delivery\",\"attempt\":3,\"percent\":92,\"status\":\"human-required\",\"message\":\"The dashboard could not verify delivery. The local draft is safe and resumable.\",\"draftRef\":{\"category\":\"sports\",\"filename\":\"safe.mdx\"},\"imageCount\":2,\"repairs\":[],\"errorCategory\":\"network\"}\n")
        end(code: 1)
        precondition(resume.title == "Try again")
        precondition(!resume.isHidden)
        precondition(!startNew.isEnabled)

        finished = false
        consume("@omnilede {\"runId\":\"smoke\",\"stage\":\"delivery-verification\",\"attempt\":1,\"percent\":100,\"status\":\"completed\",\"message\":\"Draft delivered and verified. Review it, then click Publish.\",\"draftRef\":{\"category\":\"sports\",\"filename\":\"safe.mdx\"},\"imageCount\":2,\"repairs\":[\"Ollama stopped; restarted locally (1/2)\"],\"deliveryStatus\":\"delivered\"}\n")
        consume("@omnilede {\"phase\":\"dashboard\",\"url\":\"https://example.com/admin/review\"}\n")
        precondition(delivered && dashboard.isEnabled)
        precondition(detail.stringValue.contains("2/3"))
        precondition(startNew.isEnabled)

        let view = window.contentView!
        view.layoutSubtreeIfNeeded()
        precondition(title.frame.height > 0 && status.frame.height > 0 && time.frame.height > 0)
        if let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
            view.cacheDisplay(in: view.bounds, to: bitmap)
            try? bitmap.representation(using: .png, properties: [:])?.write(
                to: URL(fileURLWithPath: "/tmp/omnilede-window.png")
            )
        }
        print("Native UI smoke checks passed: repair, adjusted estimate, cancellation, resume, delivery, and separate new-article action.")
        NSApp.terminate(nil)
    }
    #endif

    @objc func openDashboard() {
        guard delivered, let url = dashboardURL else { return }
        NSWorkspace.shared.open(url)
    }

    func applicationWillTerminate(_ notification: Notification) {
        pipe?.fileHandleForReading.readabilityHandler = nil
        if task?.isRunning == true { task?.terminate() }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return task?.isRunning != true
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        return true
    }
}

let app = NSApplication.shared
let delegate = WriterApp()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
