import AppKit

final class WriterApp: NSObject, NSApplicationDelegate {
    var window: NSWindow!

    let title = NSTextField(labelWithString: "OmniLede")
    let refresh = NSButton(title: "Refresh", target: nil, action: nil)
    let planDate = NSTextField(labelWithString: "Today")
    let todayCount = NSTextField(labelWithString: "0 of 3 written")
    let counts = NSTextField(labelWithString: "0 drafts · 0 published")
    let status = NSTextField(wrappingLabelWithString: "Choose a category to begin.")
    let taskList = NSStackView()
    let bar = NSProgressIndicator()
    let time = NSTextField(labelWithString: "")
    let detail = NSTextField(wrappingLabelWithString: "Articles stay as drafts until you click Publish.")
    let repairsLabel = NSTextField(wrappingLabelWithString: "")
    let startWriting = NSButton(title: "Start writing", target: nil, action: nil)
    let dashboard = NSButton(title: "Open review dashboard", target: nil, action: nil)
    let cancel = NSButton(title: "Cancel", target: nil, action: nil)

    var taskButtons: [NSButton] = []
    var replaceButtons: [NSButton] = []
    var planSnapshot: DailyPlanSnapshot?
    var selectedCategory: String?
    var activeCategory: String?
    var activePlanDate: String?

    var task: Process?
    var pipe: Pipe?
    var plannerTask: Process?
    var plannerPipe: Pipe?
    var timer: Timer?
    var began = Date()
    var buffer = ""
    var planBuffer = ""
    var plannerReceivedEvent = false
    var finished = false
    var delivered = false
    var reviewReady = false
    var cancelledByUser = false
    var photoCount: Int?
    var estimateExtension = 0
    var dashboardURL: URL?
    var lastTerminalMessage = ""
    var pendingBanner: String?
    var repairMessages: [String] = []
    var isSmokeTesting = false

    var repo: String {
        Bundle.main.object(forInfoDictionaryKey: "OmniLedeProjectPath") as? String ?? ""
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 760, height: 650),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "OmniLede — Daily Writer"
        window.center()

        title.font = .systemFont(ofSize: 30, weight: .bold)
        planDate.font = .systemFont(ofSize: 17, weight: .semibold)
        todayCount.font = .systemFont(ofSize: 20, weight: .bold)
        counts.textColor = .secondaryLabelColor
        status.font = .systemFont(ofSize: 15, weight: .medium)
        time.textColor = .secondaryLabelColor
        detail.textColor = .secondaryLabelColor
        repairsLabel.textColor = .secondaryLabelColor
        repairsLabel.font = .systemFont(ofSize: 12)

        refresh.target = self
        refresh.action = #selector(refreshClicked)
        refresh.bezelStyle = .rounded
        startWriting.target = self
        startWriting.action = #selector(start)
        startWriting.bezelStyle = .rounded
        startWriting.keyEquivalent = "\r"
        startWriting.isEnabled = false
        dashboard.target = self
        dashboard.action = #selector(openDashboard)
        dashboard.bezelStyle = .rounded
        dashboard.isEnabled = false
        cancel.target = self
        cancel.action = #selector(cancelRun)
        cancel.bezelStyle = .rounded
        cancel.isHidden = true

        bar.style = .bar
        bar.isIndeterminate = false
        bar.minValue = 0
        bar.maxValue = 100
        bar.isHidden = true
        time.isHidden = true
        repairsLabel.isHidden = true

        taskList.orientation = .vertical
        taskList.alignment = .leading
        taskList.spacing = 10

        let spacer = NSView()
        let topRow = NSStackView(views: [title, spacer, refresh])
        topRow.orientation = .horizontal
        topRow.alignment = .centerY
        topRow.spacing = 12

        let summaryRow = NSStackView(views: [todayCount, counts])
        summaryRow.orientation = .horizontal
        summaryRow.alignment = .firstBaseline
        summaryRow.spacing = 18

        let actionRow = NSStackView(views: [startWriting, dashboard, cancel])
        actionRow.orientation = .horizontal
        actionRow.spacing = 10

        let stack = NSStackView(views: [
            topRow, planDate, summaryRow, status, taskList,
            bar, time, detail, repairsLabel, actionRow,
        ])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 30),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -30),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 24),
            topRow.widthAnchor.constraint(equalTo: stack.widthAnchor),
            taskList.widthAnchor.constraint(equalTo: stack.widthAnchor),
            bar.widthAnchor.constraint(equalTo: stack.widthAnchor),
            status.widthAnchor.constraint(equalTo: stack.widthAnchor),
            detail.widthAnchor.constraint(equalTo: stack.widthAnchor),
            repairsLabel.widthAnchor.constraint(equalTo: stack.widthAnchor),
        ])

        showToday()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--smoke-test") {
            isSmokeTesting = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.smokeTest() }
            return
        }
        #endif
        refreshPlan()
    }

    private func localDate() -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    private func friendlyDate(_ raw: String) -> String {
        let input = DateFormatter()
        input.calendar = Calendar(identifier: .gregorian)
        input.locale = Locale(identifier: "en_US_POSIX")
        input.dateFormat = "yyyy-MM-dd"
        guard let date = input.date(from: raw) else { return raw }
        let output = DateFormatter()
        output.locale = .current
        output.dateStyle = .full
        return output.string(from: date)
    }

    private func clearTaskRows() {
        for view in taskList.arrangedSubviews {
            taskList.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
        taskButtons = []
        replaceButtons = []
    }

    private func renderTasks(_ tasks: [DailyPlanTask]) {
        clearTaskRows()
        for (index, item) in tasks.enumerated() {
            let selector = NSButton(radioButtonWithTitle: item.label, target: self, action: #selector(selectTask(_:)))
            selector.tag = index
            selector.font = .systemFont(ofSize: 15, weight: .semibold)
            selector.setButtonType(.radio)

            let state = NSTextField(labelWithString: item.status.label)
            state.font = .systemFont(ofSize: 13, weight: .semibold)
            state.textColor = item.status == .needsAttention ? .systemOrange : .secondaryLabelColor

            let replace = NSButton(title: "Replace task", target: self, action: #selector(replaceTask(_:)))
            replace.tag = index
            replace.bezelStyle = .inline
            replace.isHidden = item.status != .todo

            let spacer = NSView()
            let top = NSStackView(views: [selector, state, spacer, replace])
            top.orientation = .horizontal
            top.alignment = .centerY
            top.spacing = 10

            let reason = NSTextField(wrappingLabelWithString: item.reason)
            reason.textColor = .secondaryLabelColor
            reason.font = .systemFont(ofSize: 12)
            let card = NSStackView(views: [top, reason])
            card.orientation = .vertical
            card.alignment = .leading
            card.spacing = 5
            card.edgeInsets = NSEdgeInsets(top: 9, left: 10, bottom: 9, right: 10)
            card.wantsLayer = true
            card.layer?.cornerRadius = 8
            card.layer?.backgroundColor = NSColor.controlBackgroundColor.cgColor
            taskList.addArrangedSubview(card)
            card.widthAnchor.constraint(equalTo: taskList.widthAnchor).isActive = true
            top.widthAnchor.constraint(equalTo: card.widthAnchor, constant: -20).isActive = true
            reason.widthAnchor.constraint(equalTo: card.widthAnchor, constant: -20).isActive = true

            taskButtons.append(selector)
            replaceButtons.append(replace)
        }
    }

    private func applyPlan(_ snapshot: DailyPlanSnapshot) {
        planSnapshot = snapshot
        planDate.stringValue = friendlyDate(snapshot.date)
        todayCount.stringValue = "\(snapshot.completedCount) of \(snapshot.totalTasks) written"
        counts.stringValue = "\(snapshot.draftCount) drafts · \(snapshot.publishedCount) published"
        renderTasks(snapshot.tasks)
        if let selected = selectedCategory,
           let index = snapshot.tasks.firstIndex(where: { $0.category == selected && $0.status.isActionable }) {
            taskButtons[index].state = .on
            configureStart(for: snapshot.tasks[index])
        } else {
            clearSelection()
        }
        if let banner = pendingBanner {
            status.stringValue = banner
            pendingBanner = nil
        } else {
            status.stringValue = "Choose a category, then click Start writing."
        }
        refresh.isEnabled = true
        showToday()
    }

    private func configureStart(for item: DailyPlanTask) {
        selectedCategory = item.category
        startWriting.title = item.status == .needsAttention ? "Try again" : "Start writing"
        startWriting.isEnabled = item.status.isActionable
    }

    private func clearSelection() {
        selectedCategory = nil
        taskButtons.forEach { $0.state = .off }
        startWriting.title = "Start writing"
        startWriting.isEnabled = false
    }

    @objc func selectTask(_ sender: NSButton) {
        guard let snapshot = planSnapshot, snapshot.tasks.indices.contains(sender.tag) else { return }
        let item = snapshot.tasks[sender.tag]
        guard item.status.isActionable else {
            clearSelection()
            status.stringValue = item.status == .published
                ? "This task is published. Choose a To do task to write another article."
                : "This draft is ready for review. Open the dashboard when it is available."
            return
        }
        taskButtons.enumerated().forEach { index, button in
            button.state = index == sender.tag ? .on : .off
        }
        configureStart(for: item)
        status.stringValue = item.status == .needsAttention
            ? "Resume the saved \(item.label) article."
            : "Ready to write the \(item.label) task."
    }

    @objc func replaceTask(_ sender: NSButton) {
        guard let snapshot = planSnapshot, snapshot.tasks.indices.contains(sender.tag) else { return }
        clearSelection()
        refreshPlan(replacing: snapshot.tasks[sender.tag].category)
    }

    @objc func refreshClicked() {
        refreshPlan()
    }

    private func plannerProcess(action: String, category: String? = nil) -> Process {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [repo + "/Start OmniLede.command"]
        process.currentDirectoryURL = URL(fileURLWithPath: repo)
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        env["OMNILEDE_ACTION"] = action
        env["OMNILEDE_PLAN_DATE"] = planSnapshot?.date ?? localDate()
        if let category { env["OMNILEDE_CATEGORY"] = category }
        process.environment = env
        return process
    }

    func refreshPlan(replacing category: String? = nil) {
        guard !isSmokeTesting, plannerTask?.isRunning != true, task?.isRunning != true else { return }
        guard !repo.isEmpty else {
            handlePlanError("The OmniLede project folder could not be found. Reinstall the app from the project folder.")
            return
        }
        refresh.isEnabled = false
        startWriting.isEnabled = false
        status.stringValue = category == nil ? "Refreshing today's plan…" : "Replacing that task…"
        planBuffer = ""
        plannerReceivedEvent = false
        let process = plannerProcess(action: category == nil ? "plan-snapshot" : "plan-replace", category: category)
        let output = Pipe()
        process.standardOutput = output
        process.standardError = output
        plannerTask = process
        plannerPipe = output
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                handle.readabilityHandler = nil
                return
            }
            let text = String(decoding: data, as: UTF8.self)
            DispatchQueue.main.async { self?.consumePlan(text) }
        }
        process.terminationHandler = { [weak self] process in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                self?.finishPlanner(code: process.terminationStatus)
            }
        }
        do {
            try process.run()
        } catch {
            plannerTask = nil
            handlePlanError("Today's plan could not be opened. Your saved work is unchanged.")
        }
    }

    func consumePlan(_ text: String) {
        planBuffer += text
        while let range = planBuffer.range(of: "\n") {
            let line = String(planBuffer[..<range.lowerBound])
            planBuffer.removeSubrange(..<range.upperBound)
            if line.hasPrefix("@omnilede-plan ") {
                let payload = String(line.dropFirst("@omnilede-plan ".count))
                if let data = payload.data(using: .utf8),
                   let snapshot = try? JSONDecoder().decode(DailyPlanSnapshot.self, from: data),
                   snapshot.tasks.count == 3 {
                    plannerReceivedEvent = true
                    applyPlan(snapshot)
                } else {
                    plannerReceivedEvent = true
                    handlePlanError("Today's plan response was not valid. Your saved work is unchanged.")
                }
            } else if line.hasPrefix("@omnilede-plan-error ") {
                let payload = String(line.dropFirst("@omnilede-plan-error ".count))
                let message = payload.data(using: .utf8)
                    .flatMap { try? JSONDecoder().decode(DailyPlanError.self, from: $0).message }
                    ?? "Daily plan could not be refreshed. Your saved work is unchanged."
                plannerReceivedEvent = true
                handlePlanError(message)
            }
        }
    }

    private func finishPlanner(code: Int32) {
        plannerPipe?.fileHandleForReading.readabilityHandler = nil
        plannerTask = nil
        refresh.isEnabled = true
        if code != 0 && !plannerReceivedEvent {
            handlePlanError("Daily plan could not be refreshed. Your saved work is unchanged.")
        }
    }

    private func handlePlanError(_ message: String) {
        refresh.isEnabled = true
        status.stringValue = message
        showToday()
    }

    private func showToday() {
        planDate.isHidden = false
        todayCount.isHidden = false
        counts.isHidden = false
        taskList.isHidden = false
        startWriting.isHidden = false
        bar.isHidden = true
        time.isHidden = true
        repairsLabel.isHidden = true
        cancel.isHidden = true
        detail.isHidden = false
        detail.stringValue = "Articles remain drafts until you review them and click Publish."
        dashboard.isHidden = false
        dashboard.isEnabled = reviewReady && dashboardURL != nil
    }

    private func showWriting() {
        planDate.isHidden = true
        todayCount.isHidden = true
        counts.isHidden = true
        taskList.isHidden = true
        startWriting.isHidden = true
        bar.isHidden = false
        time.isHidden = false
        repairsLabel.isHidden = false
        cancel.isHidden = false
        dashboard.isHidden = false
        dashboard.isEnabled = false
        detail.isHidden = false
    }

    @objc func start() {
        guard task?.isRunning != true,
              let snapshot = planSnapshot,
              let category = selectedCategory,
              let item = snapshot.tasks.first(where: { $0.category == category && $0.status.isActionable }) else {
            return
        }
        finished = false
        delivered = false
        reviewReady = false
        cancelledByUser = false
        photoCount = nil
        estimateExtension = 0
        buffer = ""
        began = Date()
        lastTerminalMessage = ""
        repairMessages = []
        repairsLabel.stringValue = ""
        activeCategory = category
        activePlanDate = snapshot.date
        refresh.isEnabled = false
        cancel.isEnabled = true
        bar.doubleValue = 3
        status.stringValue = item.status == .needsAttention
            ? "Resuming your saved article…"
            : "Starting your local writer…"
        detail.stringValue = "Progress follows completed steps. You can minimise this window."
        showWriting()

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [repo + "/Start OmniLede.command"]
        process.currentDirectoryURL = URL(fileURLWithPath: repo)
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        env["OMNILEDE_DESKTOP"] = "true"
        env["OMNILEDE_ACTION"] = "write"
        env["OMNILEDE_CATEGORY"] = category
        env["OMNILEDE_PLAN_DATE"] = snapshot.date
        if item.status == .todo { env["OMNILEDE_START_NEW"] = "true" }
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
            task = nil
            pendingBanner = "Could not start the local writer. Reinstall OmniLede.app from this project folder."
            showToday()
            refresh.isEnabled = true
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
                if reviewReady {
                    dashboard.isEnabled = true
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
            if event["stage"] as? String == "dashboard-delivery" {
                cancel.isEnabled = false
                cancel.isHidden = true
            }

            let eventStatus = event["status"] as? String ?? ""
            if eventStatus == "repaired", let message = event["message"] as? String {
                repairMessages.append(message)
                detail.stringValue = message
                showRepairs()
            } else if eventStatus == "retrying" {
                estimateExtension += 30
                if let message = event["message"] as? String { detail.stringValue = message }
                tick()
            } else if eventStatus == "human-required" || eventStatus == "failed" || eventStatus == "cancelled" {
                lastTerminalMessage = event["message"] as? String ?? "The run needs attention."
                detail.stringValue = lastTerminalMessage
            } else if eventStatus == "completed" {
                delivered = event["deliveryStatus"] as? String == "delivered"
                reviewReady = true
                lastTerminalMessage = event["message"] as? String ?? "Draft ready for review."
                showRepairs()
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
        guard !finished else { return }
        finished = true
        timer?.invalidate()
        bar.doubleValue = 100
        let seconds = Int(Date().timeIntervalSince(began))
        UserDefaults.standard.set(seconds, forKey: "lastSuccessfulDuration")
        pendingBanner = lastTerminalMessage.isEmpty
            ? "Draft delivered. Review it in the dashboard, then click Publish."
            : lastTerminalMessage
        dashboard.isEnabled = reviewReady && dashboardURL != nil
        showToday()
        if !isSmokeTesting { refreshPlan() }
    }

    func end(code: Int32) {
        task = nil
        pipe?.fileHandleForReading.readabilityHandler = nil
        timer?.invalidate()
        if finished { return }
        if code == 0 && reviewReady {
            finishDisplay()
            return
        }

        finished = true
        let message: String
        if cancelledByUser {
            message = "Cancelled — your completed work is safe. Select the task and click Try again."
        } else if !lastTerminalMessage.isEmpty {
            message = lastTerminalMessage
        } else {
            message = "Writing or delivery could not finish. Your existing drafts are safe."
        }
        pendingBanner = message
        status.stringValue = message
        showToday()
        refresh.isEnabled = true
        if !isSmokeTesting { refreshPlan() }
    }

    #if DEBUG
    func smokeTest() {
        func buttons(in view: NSView) -> [NSButton] {
            let own = view as? NSButton
            return (own.map { [$0] } ?? []) + view.subviews.flatMap { buttons(in: $0) }
        }

        precondition(task == nil, "Opening OmniLede must stay idle")
        let initialButtonTitles = buttons(in: window.contentView!).map(\.title)
        precondition(initialButtonTitles.contains("Refresh"))
        precondition(initialButtonTitles.contains("Start writing"))

        consumePlan("""
        @omnilede-plan {"date":"2026-10-02","completedCount":1,"totalTasks":3,"draftCount":2,"publishedCount":24,"tasks":[{"category":"anime","label":"Anime","reason":"No published article yet","status":"todo"},{"category":"sports","label":"Sports","reason":"Draft waiting for review","status":"draft-ready","draftRef":{"category":"sports","filename":"sports-draft.mdx"}},{"category":"finance","label":"Finance","reason":"Last published 2026-09-20","status":"published","draftRef":{"category":"finance","filename":"finance-story.mdx"}}]}
        """ + "\n")
        precondition(planSnapshot?.tasks.count == 3)
        precondition(todayCount.stringValue == "1 of 3 written")
        precondition(counts.stringValue.contains("2 drafts"))
        precondition(taskButtons.count == 3 && replaceButtons.count == 3)
        taskButtons[0].performClick(nil)
        precondition(selectedCategory == "anime" && startWriting.isEnabled)
        taskButtons[2].performClick(nil)
        precondition(selectedCategory == nil && !startWriting.isEnabled)
        precondition(replaceButtons[2].isHidden)

        consumePlan("@omnilede-plan-error {\"message\":\"Daily plan could not be refreshed. Your saved work is unchanged.\"}\n")
        precondition(task == nil && refresh.isEnabled)
        precondition(status.stringValue.contains("could not be refreshed"))

        showWriting()
        consume("@omnilede {\"runId\":\"smoke\",\"category\":\"anime\",\"stage\":\"preflight\",\"attempt\":1,\"percent\":5,\"status\":\"repaired\",\"message\":\"Ollama stopped; restarted locally (1/2)\",\"imageCount\":0,\"repairs\":[\"Ollama stopped; restarted locally (1/2)\"]}\n")
        precondition(detail.stringValue.contains("restarted locally"))
        consume("@omnilede {\"runId\":\"smoke\",\"category\":\"anime\",\"stage\":\"generation\",\"attempt\":2,\"percent\":35,\"status\":\"retrying\",\"message\":\"The draft needed correction; regenerating from the original source.\",\"imageCount\":0,\"repairs\":[],\"errorCategory\":\"generation-invalid\"}\n")
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
        task = nil

        cancelledByUser = false
        finished = false
        showWriting()
        consume("@omnilede {\"runId\":\"smoke\",\"category\":\"anime\",\"stage\":\"delivery-verification\",\"attempt\":1,\"percent\":100,\"status\":\"completed\",\"message\":\"Draft delivered and verified. Review it, then click Publish.\",\"draftRef\":{\"category\":\"anime\",\"filename\":\"safe.mdx\"},\"imageCount\":2,\"repairs\":[\"Ollama stopped; restarted locally (1/2)\"],\"deliveryStatus\":\"delivered\"}\n")
        consume("@omnilede {\"phase\":\"dashboard\",\"url\":\"https://example.com/admin/review\"}\n")
        precondition(delivered && dashboard.isEnabled)
        precondition(photoCount == 2)
        precondition(status.stringValue.contains("delivered"))

        let view = window.contentView!
        view.layoutSubtreeIfNeeded()
        precondition(title.frame.height > 0 && status.frame.height > 0 && todayCount.frame.height > 0)
        if let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
            view.cacheDisplay(in: view.bounds, to: bitmap)
            try? bitmap.representation(using: .png, properties: [:])?.write(
                to: URL(fileURLWithPath: "/tmp/omnilede-window.png")
            )
        }
        print("Native UI smoke checks passed: idle planner, refresh, selection, status, cancellation, recovery, and delivery.")
        NSApp.terminate(nil)
    }
    #endif

    @objc func openDashboard() {
        guard reviewReady, let url = dashboardURL else { return }
        NSWorkspace.shared.open(url)
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        if window != nil && !isSmokeTesting && task?.isRunning != true && plannerTask?.isRunning != true {
            refreshPlan()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        plannerPipe?.fileHandleForReading.readabilityHandler = nil
        pipe?.fileHandleForReading.readabilityHandler = nil
        if plannerTask?.isRunning == true { plannerTask?.terminate() }
        if task?.isRunning == true { task?.terminate() }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        if !isSmokeTesting && task?.isRunning != true { refreshPlan() }
        return true
    }
}

@main
struct OmniLedeMain {
    static func main() {
        let app = NSApplication.shared
        let delegate = WriterApp()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
    }
}
