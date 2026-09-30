import AppKit

final class WriterApp: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let title = NSTextField(labelWithString: "OmniLede")
    let status = NSTextField(wrappingLabelWithString: "Getting ready…")
    let time = NSTextField(labelWithString: "")
    let detail = NSTextField(wrappingLabelWithString: "Articles stay as drafts until you click Publish.")
    let bar = NSProgressIndicator()
    let dashboard = NSButton(title: "Open review dashboard", target: nil, action: nil)
    let retry = NSButton(title: "Write another article", target: nil, action: nil)
    var task: Process?
    var pipe: Pipe?
    var timer: Timer?
    var began = Date()
    var buffer = ""
    var log = ""
    var finished = false
    var delivered = false
    var photoCount: Int?
    var dashboardURL: URL?
    var repo: String { Bundle.main.object(forInfoDictionaryKey: "OmniLedeProjectPath") as? String ?? "" }

    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 550, height: 340), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "OmniLede — Local Writer"
        window.center()
        title.font = .systemFont(ofSize: 30, weight: .bold)
        status.font = .systemFont(ofSize: 17, weight: .medium)
        time.textColor = .secondaryLabelColor
        detail.textColor = .secondaryLabelColor
        bar.style = .bar
        bar.isIndeterminate = false
        bar.minValue = 0
        bar.maxValue = 100
        dashboard.target = self
        dashboard.action = #selector(openDashboard)
        dashboard.bezelStyle = .rounded
        dashboard.isEnabled = false
        retry.target = self
        retry.action = #selector(start)
        retry.bezelStyle = .rounded
        retry.isHidden = true
        let stack = NSStackView(views: [title, status, bar, time, detail, dashboard, retry])
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
            detail.widthAnchor.constraint(equalTo: stack.widthAnchor)
        ])
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--smoke-test") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.smokeTest() }
            return
        }
        #endif
        start()
    }

    @objc func start() {
        guard task?.isRunning != true else { return }
        finished = false; delivered = false; photoCount = nil; buffer = ""; log = ""; began = Date()
        retry.title = "Write another article"
        retry.isHidden = true; dashboard.isEnabled = false; bar.doubleValue = 3
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
        process.standardOutput = output; process.standardError = output
        pipe = output; task = process
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { handle.readabilityHandler = nil; return }
            let text = String(decoding: data, as: UTF8.self)
            DispatchQueue.main.async { self?.consume(text) }
        }
        process.terminationHandler = { [weak self] process in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self?.end(code: process.terminationStatus) }
        }
        do {
            try process.run()
            timer?.invalidate()
            timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.tick() }
            tick()
        } catch {
            status.stringValue = "Could not start the local writer."
            detail.stringValue = error.localizedDescription
            retry.isHidden = false
        }
    }

    func consume(_ text: String) {
        log += text; buffer += text
        while let range = buffer.range(of: "\n") {
            let line = String(buffer[..<range.lowerBound])
            buffer.removeSubrange(..<range.upperBound)
            guard line.hasPrefix("@omnilede "),
                  let data = String(line.dropFirst(10)).data(using: .utf8),
                  let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            if let count = event["photos"] as? Int { photoCount = count }
            if let percent = event["percent"] as? Double { bar.doubleValue = percent }
            if let message = event["message"] as? String { status.stringValue = message }
            if event["phase"] as? String == "done" { delivered = true }
            if event["phase"] as? String == "dashboard", let raw = event["url"] as? String, let url = URL(string: raw),
               url.scheme == "https" || (url.scheme == "http" && url.host == "127.0.0.1") {
                dashboardURL = url; dashboard.isEnabled = true
                if delivered { openDashboard(); finishDisplay() }
            }
        }
    }

    func tick() {
        guard !finished else { return }
        let elapsed = Int(Date().timeIntervalSince(began))
        let prior = UserDefaults.standard.double(forKey: "lastSuccessfulDuration")
        let estimate = prior > 0 ? max(20, Int(prior)) : 90
        let remaining = estimate - elapsed
        time.stringValue = remaining > 0
            ? "Elapsed: \(elapsed)s · About \(remaining)s remaining (estimate)"
            : "Elapsed: \(elapsed)s · Taking longer than estimated; still working…"
    }

    func finishDisplay() {
        finished = true; timer?.invalidate(); bar.doubleValue = 100
        let seconds = Int(Date().timeIntervalSince(began))
        UserDefaults.standard.set(seconds, forKey: "lastSuccessfulDuration")
        time.stringValue = "Completed in \(seconds) seconds"
        let photos = photoCount.map { "\($0)/3 related photos included. " } ?? ""
        detail.stringValue = photos + "Select your draft in the dashboard, check the text and pictures, then click Publish. Sign in there if asked."
        retry.isHidden = false
    }

    func end(code: Int32) {
        if code == 0 && delivered {
            if !finished { finishDisplay() }
        } else {
            finished = true; timer?.invalidate()
            status.stringValue = "Your article needs attention."
            time.stringValue = "Stopped after \(Int(Date().timeIntervalSince(began))) seconds"
            if log.contains("Another local writer") {
                detail.stringValue = "Another writer is already running. Let it finish before trying again."
            } else if log.contains("Model is not installed") {
                detail.stringValue = "The selected AI model is not installed. Your existing drafts are safe."
            } else if log.contains("truncated") {
                detail.stringValue = "The AI response was incomplete. Try again; nothing was published."
            } else {
                detail.stringValue = "Writing or delivery could not finish. Your existing drafts are safe. Try again; technical details are saved in .audit/desktop-writer.log."
            }
            retry.title = "Try again"; retry.isHidden = false
        }
        let logURL = URL(fileURLWithPath: repo).appendingPathComponent(".audit/desktop-writer.log")
        try? log.write(to: logURL, atomically: true, encoding: .utf8)
    }
    #if DEBUG
    func smokeTest() {
        consume("@omnilede {\"phase\":\"writing\",\"message\":\"Writing your article on this Mac…\",\"percent\":30}\n")
        precondition(bar.doubleValue == 30)
        precondition(status.stringValue.contains("Writing"))
        tick()
        precondition(time.stringValue.contains("estimate"))
        let view = window.contentView!
        view.layoutSubtreeIfNeeded()
        precondition(title.frame.height > 0 && status.frame.height > 0 && time.frame.height > 0)
        if let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
            view.cacheDisplay(in: view.bounds, to: bitmap)
            try? bitmap.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: "/tmp/omnilede-window.png"))
        }
        consume("@omnilede {\"phase\":\"done\",\"message\":\"1 draft delivered.\",\"percent\":100}\n")
        precondition(delivered && bar.doubleValue == 100)
        log = "Another local writer"
        end(code: 1)
        precondition(status.stringValue == "Your article needs attention.")
        precondition(detail.stringValue.contains("already running"))
        print("Native UI smoke checks passed: progress, estimate, delivery, and failure.")
        NSApp.terminate(nil)
    }
    #endif
    @objc func openDashboard() { if let url = dashboardURL { NSWorkspace.shared.open(url) } }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { return task?.isRunning != true }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil); return true
    }
}
let app = NSApplication.shared
let delegate = WriterApp()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
