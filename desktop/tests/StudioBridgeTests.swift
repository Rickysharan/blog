import Foundation

private enum TestFailure: Error, CustomStringConvertible {
    case failed(String)
    var description: String { if case let .failed(message) = self { return message }; return "failed" }
}

private func expect(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    if !condition() { throw TestFailure.failed(message) }
}

private func waitUntil(timeout: TimeInterval = 3, _ condition: () -> Bool) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        if condition() { return true }
        _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.02))
    }
    return condition()
}

@main
struct StudioBridgeTests {
    static func main() throws {
        do {
            _ = try StudioConfiguration(studioURL: nil, projectPath: "/tmp/omnilede")
            throw TestFailure.failed("accepted a missing Studio origin")
        } catch StudioConfigurationError.missing("OmniLedeStudioURL") { }
        let configuration = try StudioConfiguration(
            studioURL: "https://studio.example.com/categories",
            supabaseAuthURL: "https://project-ref.supabase.co",
            projectPath: "/tmp/omnilede"
        )
        try expect(configuration.origin.absoluteString == "https://studio.example.com", "normalizes the configured origin")
        try expect(configuration.allows(url: URL(string: "https://studio.example.com/today")!), "allows an exact-origin path")
        try expect(!configuration.allows(url: URL(string: "https://studio.example.com.evil.test/today")!), "rejects a host-prefix attack")
        try expect(!configuration.allows(url: URL(string: "https://evil.example/today")!), "rejects an unrelated origin")
        try expect(!configuration.allows(url: URL(string: "https://user:pass@studio.example.com/today")!), "rejects URL credentials")
        try expect(!configuration.allows(url: URL(string: "https://studio.example.com:444/today")!), "rejects a different effective port")
        try expect(configuration.allows(url: URL(string: "https://studio.example.com:443/today")!), "accepts the equivalent HTTPS default port")
        let googleAuthorize = URL(string: "https://project-ref.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fstudio.example.com%2Fauth%2Fnative%2Frelay&code_challenge=challenge&code_challenge_method=s256")!
        try expect(configuration.allowsExternalGoogleOAuth(url: googleAuthorize, isMainFrame: true), "opens the exact Supabase Google authorization request externally")
        try expect(!configuration.allowsExternalGoogleOAuth(url: googleAuthorize, isMainFrame: false), "blocks an OAuth request from an iframe")
        for hostile in [
            "https://project-ref.supabase.co.evil.test/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fstudio.example.com%2Fauth%2Fnative%2Frelay",
            "https://project-ref.supabase.co/auth/v1/token?provider=google&redirect_to=https%3A%2F%2Fstudio.example.com%2Fauth%2Fnative%2Frelay",
            "https://project-ref.supabase.co/auth/v1/authorize?provider=github&redirect_to=https%3A%2F%2Fstudio.example.com%2Fauth%2Fnative%2Frelay",
            "https://project-ref.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fevil.example%2Fsteal"
        ] {
            try expect(!configuration.allowsExternalGoogleOAuth(url: URL(string: hostile)!, isMainFrame: true), "rejects a forged external OAuth request")
        }
        let nativeCallback = URL(string: "com.rickysharan.omnilede://auth-callback?code=one-time-code")!
        try expect(configuration.studioCallbackURL(from: nativeCallback)?.absoluteString == "https://studio.example.com/auth/callback?code=one-time-code&next=/overview", "returns a native callback to the Studio PKCE exchange")
        for hostile in [
            "com.rickysharan.omnilede://evil?code=one-time-code",
            "com.rickysharan.omnilede://auth-callback?code=one&code=two",
            "com.rickysharan.omnilede://auth-callback?code=",
            "https://studio.example.com/auth-callback?code=one-time-code"
        ] {
            try expect(configuration.studioCallbackURL(from: URL(string: hostile)!) == nil, "rejects a malformed native callback")
        }

        for unsafe in [
            "http://studio.example.com",
            "https://localhost",
            "https://127.0.0.1",
            "https://10.0.0.8",
            "https://172.16.5.4",
            "https://192.168.1.2",
            "https://100.64.0.1",
            "https://198.18.0.1",
            "https://198.51.100.8",
            "https://[::1]",
            "https://2130706433",
            "https://intranet",
            "https://writer.home.arpa",
            "https://studio.local",
            "https://studio.example",
            "https://user:pass@studio.example.com"
        ] {
            do {
                _ = try StudioConfiguration(studioURL: unsafe, projectPath: "/tmp/omnilede")
                throw TestFailure.failed("accepted unsafe Studio URL: \(unsafe)")
            } catch is StudioConfigurationError { }
        }

        var starts: [StudioBridgeCommand] = []
        var rejections: [String] = []
        let bridge = StudioBridgePolicy(
            configuration: configuration,
            start: { starts.append($0) },
            reject: { rejections.append($0) }
        )
        let validWrite: [String: Any] = [
            "action": "write",
            "category": "sports",
            "requestId": "request-12345678"
        ]

        try expect(bridge.handle(body: validWrite, sourceURL: URL(string: "https://evil.example/categories"), isMainFrame: true, hasUserActivation: true) == false, "rejects evil origin")
        try expect(bridge.handle(body: validWrite, sourceURL: URL(string: "https://studio.example.com.evil.test/categories"), isMainFrame: true, hasUserActivation: true) == false, "rejects deceptive subdomain")
        try expect(bridge.handle(body: validWrite, sourceURL: URL(string: "https://studio.example.com/categories"), isMainFrame: false, hasUserActivation: true) == false, "rejects an iframe")
        try expect(bridge.handle(body: validWrite, sourceURL: URL(string: "https://studio.example.com/categories"), isMainFrame: true, hasUserActivation: false) == false, "requires a visible trusted click")
        try expect(starts.isEmpty, "hostile requests never create a process")
        try expect(rejections.count == 4, "records an audit-safe reason for every hostile request")
        try expect(rejections.allSatisfy { !$0.contains("evil.example") && !$0.contains("user:pass") }, "rejection log does not copy hostile URLs")

        let invalidBodies: [[String: Any]] = [
            ["action": "publish", "requestId": "request-12345678"],
            ["action": "write", "category": "sports"],
            ["action": "write", "category": "technology", "requestId": "request-12345678"],
            ["action": "write", "category": "sports", "requestId": "short"],
            ["action": "write", "category": "sports", "requestId": "réquest-12345678"],
            ["action": "write", "category": "sports", "requestId": "request-12345678", "extra": true]
        ]
        for body in invalidBodies {
            try expect(bridge.handle(body: body, sourceURL: URL(string: "https://studio.example.com/categories")!, isMainFrame: true, hasUserActivation: true) == false, "rejects malformed or unsupported messages")
        }
        try expect(starts.isEmpty, "invalid requests never create a process")

        for category in StudioWriterCategory.allCases {
            let requestId = "request-\(category.rawValue)-12345678"
            try expect(bridge.handle(
                body: ["action": "write", "category": category.rawValue, "requestId": requestId],
                sourceURL: URL(string: "https://studio.example.com/categories")!,
                isMainFrame: true,
                hasUserActivation: true
            ), "accepts the supported category \(category.rawValue)")
        }
        try expect(StudioWriterCategory.allCases.map(\.rawValue).contains("top-10"), "includes the Top 10 writer category")
        try expect(starts.filter { if case .write = $0 { return true }; return false }.count == 7, "accepts exactly all seven writer categories")
        try expect(bridge.handle(body: ["action": "cancel", "requestId": "cancel-12345678"], sourceURL: URL(string: "https://studio.example.com/categories")!, isMainFrame: true, hasUserActivation: true), "accepts activated cancellation")
        try expect(bridge.handle(body: ["action": "refresh", "requestId": "refresh-12345678"], sourceURL: URL(string: "https://studio.example.com/categories")!, isMainFrame: true, hasUserActivation: true), "accepts activated status refresh")

        var plannedStarts: [StudioBridgeCommand] = []
        let plannedBridge = StudioBridgePolicy(
            configuration: configuration,
            plannedWriteMode: { $0 == "anime" && $1 == "2026-10-03" ? .resume : nil },
            start: { plannedStarts.append($0) },
            reject: { rejections.append($0) }
        )
        try expect(plannedBridge.handle(
            body: ["action": "write", "category": "anime", "planDate": "2026-10-03", "requestId": "planned-write-1234"],
            sourceURL: URL(string: "https://studio.example.com/today")!, isMainFrame: true, hasUserActivation: true
        ), "accepts a planned write bound to the latest validated snapshot")
        try expect(plannedStarts == [.write(category: "anime", requestId: "planned-write-1234", planDate: "2026-10-03", mode: .resume)], "carries the exact validated plan date and Swift-derived resume mode into the writer command")
        for rejected in [
            ["action": "write", "category": "sports", "planDate": "2026-10-03", "requestId": "wrong-pair-12345"],
            ["action": "write", "category": "anime", "planDate": "2026-10-04", "requestId": "stale-date-12345"],
            ["action": "write", "category": "anime", "planDate": "2026-02-30", "requestId": "invalid-date-1234"],
        ] {
            try expect(!plannedBridge.handle(body: rejected, sourceURL: URL(string: "https://studio.example.com/today")!, isMainFrame: true, hasUserActivation: true), "rejects an unbound or invalid plan date/category pair")
        }
        try expect(plannedStarts.count == 1, "does not start a writer for injected planner ownership")

        let admission = StudioWriterAdmission()
        try expect(admission.begin(category: "sports", requestId: "request-12345678"), "admits the first writer")
        try expect(!admission.begin(category: "anime", requestId: "request-87654321"), "rejects a second writer while one is active")
        try expect(admission.activeCategory == "sports" && admission.activeRequestId == "request-12345678", "a rejected start cannot replace active run ownership")
        try expect(!admission.finish(requestId: "request-87654321"), "a stale request cannot release the active writer")
        try expect(admission.finish(requestId: "request-12345678"), "the active request releases its writer slot")

        let sanitizer = StudioStatusSanitizer()
        let sanitized = sanitizer.status(from: [
            "status": "human-required", "stage": "generation", "percent": 38, "message": "secret raw output",
            "deliveryStatus": "pending", "errorCategory": "generation-invalid",
            "token": "do-not-expose", "body": "article bytes"
        ], elapsed: 12, estimatedDuration: 60)
        try expect(sanitized?["phase"] as? String == "generation", "keeps the phase")
        try expect(sanitized?["progress"] as? Int == 38, "keeps bounded progress")
        try expect(sanitized?["etaSeconds"] is NSNull, "does not promise an ETA after a terminal error")
        try expect(sanitized?["delivery"] as? String == "not-delivered", "marks a terminal error as not delivered")
        try expect(sanitized?["error"] as? String == "Writing needs attention. Try again.", "maps errors to safe copy")
        try expect(sanitized?["message"] == nil && sanitized?["token"] == nil && sanitized?["body"] == nil, "does not expose raw output, secrets, or article bytes")
        let retrying = sanitizer.status(from: [
            "status": "retrying", "stage": "generation", "percent": 38,
            "errorCategory": "generation-unavailable"
        ], elapsed: 12, estimatedDuration: 60)
        try expect(retrying?["error"] is NSNull, "keeps automatic retries active instead of offering a second writer")
        try expect(retrying?["etaSeconds"] as? Int == 48, "retains an ETA while work continues")
        let completed = sanitizer.status(from: [
            "status": "completed", "stage": "delivery-verification", "percent": 100,
            "deliveryStatus": "delivered"
        ], elapsed: 45, estimatedDuration: 90)
        try expect(completed?["etaSeconds"] as? Int == 0, "reports zero ETA after delivery")
        let localOnly = sanitizer.status(from: [
            "status": "completed", "stage": "delivery-verification", "percent": 100,
            "deliveryStatus": "not-delivered"
        ], elapsed: 45, estimatedDuration: 90)
        try expect(localOnly?["delivery"] as? String == "not-delivered" && localOnly?["error"] is String, "does not label a local-only completion as delivered")
        let ambiguousCompletion = sanitizer.status(from: [
            "status": "completed", "stage": "delivery-verification", "percent": 100
        ], elapsed: 45, estimatedDuration: 90)
        try expect(ambiguousCompletion?["delivery"] as? String == "not-delivered" && ambiguousCompletion?["error"] is String, "requires an explicit delivered terminal field")

        try expect(!configuration.allowsRedirect(from: URL(string: "https://studio.example.com/login")!, to: URL(string: "https://evil.example/callback")!), "blocks an origin-changing redirect")
        try expect(configuration.allowsRedirect(from: URL(string: "https://studio.example.com/login")!, to: URL(string: "https://studio.example.com/categories")!), "allows a same-origin redirect")
        var navigationRejections: [String] = []
        let navigationPolicy = StudioNavigationPolicy(configuration: configuration) { navigationRejections.append($0) }
        try expect(!navigationPolicy.allows(
            url: URL(string: "https://studio.example.com/categories")!,
            isMainFrame: false
        ), "blocks a same-origin iframe navigation")
        try expect(!navigationPolicy.allows(
            url: URL(string: "https://evil.example/callback")!,
            isMainFrame: true,
            redirectFrom: URL(string: "https://studio.example.com/login")!
        ), "blocks an origin-changing redirect after initial load")
        try expect(navigationRejections == ["rejected-navigation-frame", "rejected-navigation-redirect"], "records fixed audit-safe navigation reasons")
        try expect(starts.filter { if case .write = $0 { return true }; return false }.count == 7, "hostile navigation does not create another writer command")

        let auditRoot = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("omnilede-audit-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: auditRoot) }
        let audit = StudioAuditLog(projectPath: auditRoot.path)
        audit.append("raw writer output\n")
        let auditURL = auditRoot.appendingPathComponent(".audit/desktop-writer.log")
        let permissions = try FileManager.default.attributesOfItem(atPath: auditURL.path)[.posixPermissions] as? NSNumber
        try expect(permissions?.intValue == 0o600, "keeps raw writer logs private")

        let writerRoot = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("omnilede-writer-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: writerRoot) }
        try FileManager.default.createDirectory(at: writerRoot, withIntermediateDirectories: true)
        let launcher = writerRoot.appendingPathComponent("Start OmniLede.command")
        try """
        #!/bin/bash
        trap 'touch "$PWD/cancelled"; exit 130' TERM
        touch "$PWD/started"
        for ((i=0; i<600; i++)); do sleep 0.1; done
        """.write(to: launcher, atomically: true, encoding: .utf8)
        let writerConfiguration = try StudioConfiguration(studioURL: "https://studio.example.com", projectPath: writerRoot.path)
        var writerStatuses: [[String: Any]] = []
        let writer = LocalWriterController(configuration: writerConfiguration) { writerStatuses.append($0) }
        defer { writer.shutdown() }
        writer.perform(.write(category: "sports", requestId: "writer-one-12345"))
        try expect(waitUntil { FileManager.default.fileExists(atPath: writerRoot.appendingPathComponent("started").path) }, "starts the explicit writer process")
        writer.perform(.write(category: "anime", requestId: "writer-two-12345"))
        try expect(writerStatuses.contains { $0["requestId"] as? String == "writer-two-12345" && $0["phase"] as? String == "already-running" }, "keeps one writer process at a time")
        writer.perform(.cancel(requestId: "wrong-request-12345"))
        _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.15))
        try expect(!FileManager.default.fileExists(atPath: writerRoot.appendingPathComponent("cancelled").path), "does not cancel for a stale request ID")
        writer.perform(.cancel(requestId: "writer-one-12345"))
        try expect(waitUntil { FileManager.default.fileExists(atPath: writerRoot.appendingPathComponent("cancelled").path) }, "cancels the owned writer process")
        try expect(waitUntil { writerStatuses.contains { $0["requestId"] as? String == "writer-one-12345" && $0["phase"] as? String == "delivery-unverified" } }, "reports safe terminal status and releases cancellation resources")

        try? FileManager.default.removeItem(at: writerRoot.appendingPathComponent("started"))
        try? FileManager.default.removeItem(at: writerRoot.appendingPathComponent("cancelled"))
        writer.perform(.write(category: "finance", requestId: "writer-three-12345"))
        try expect(waitUntil { FileManager.default.fileExists(atPath: writerRoot.appendingPathComponent("started").path) }, "admits another writer after cleanup")
        writer.shutdown()
        try expect(waitUntil { FileManager.default.fileExists(atPath: writerRoot.appendingPathComponent("cancelled").path) }, "shutdown cancels the remaining writer")

        let deliveredRoot = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("omnilede-delivered-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: deliveredRoot) }
        try FileManager.default.createDirectory(at: deliveredRoot, withIntermediateDirectories: true)
        try """
        #!/bin/bash
        printf '%s\n' '@omnilede {"status":"completed","stage":"delivery-verification","percent":100,"deliveryStatus":"delivered"}'
        printf '%s' '@omnilede {"phase":"dashboard","url":"https://reader.example/admin"}'
        """.write(to: deliveredRoot.appendingPathComponent("Start OmniLede.command"), atomically: true, encoding: .utf8)
        let deliveredConfiguration = try StudioConfiguration(studioURL: "https://studio.example.com", projectPath: deliveredRoot.path)
        var deliveredStatuses: [[String: Any]] = []
        let deliveredWriter = LocalWriterController(configuration: deliveredConfiguration) { deliveredStatuses.append($0) }
        deliveredWriter.perform(.write(category: "sports", requestId: "delivered-race-12345"))
        try expect(waitUntil { deliveredStatuses.contains { $0["delivery"] as? String == "delivered" } }, "drains an explicit terminal delivery emitted immediately before exit")
        _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.15))
        try expect(deliveredStatuses.last?["delivery"] as? String == "delivered", "does not let a trailing dashboard event replace delivered state")

        let ambiguousRoot = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("omnilede-ambiguous-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: ambiguousRoot) }
        try FileManager.default.createDirectory(at: ambiguousRoot, withIntermediateDirectories: true)
        try """
        #!/bin/bash
        printf '%s' '@omnilede {"status":"progress","stage":"delivery-verification","percent":100}'
        exit 0
        """.write(to: ambiguousRoot.appendingPathComponent("Start OmniLede.command"), atomically: true, encoding: .utf8)
        let ambiguousConfiguration = try StudioConfiguration(studioURL: "https://studio.example.com", projectPath: ambiguousRoot.path)
        var ambiguousStatuses: [[String: Any]] = []
        let ambiguousWriter = LocalWriterController(configuration: ambiguousConfiguration) { ambiguousStatuses.append($0) }
        ambiguousWriter.perform(.write(category: "finance", requestId: "ambiguous-zero-12345"))
        try expect(waitUntil { ambiguousStatuses.last?["phase"] as? String == "delivery-unverified" }, "finishes a zero-exit run without a terminal event as unverified")
        try expect(!ambiguousStatuses.contains { $0["delivery"] as? String == "delivered" }, "never invents verified delivery from exit code zero")

        let plannerRoot = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("omnilede-planner-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: plannerRoot) }
        try FileManager.default.createDirectory(at: plannerRoot, withIntermediateDirectories: true)
        let preserved = Data([0, 255, 10, 65, 66, 67])
        let preservedURL = plannerRoot.appendingPathComponent("daily-plan-v1.json")
        try preserved.write(to: preservedURL)
        try """
        #!/bin/bash
        if [ "$OMNILEDE_ACTION" != "plan-snapshot" ]; then touch "$PWD/writer-started"; exit 9; fi
        printf '%s\n' '@omnilede-plan {"date":"2026-10-03","completedCount":1,"totalTasks":3,"draftCount":2,"publishedCount":24,"tasks":[{"category":"anime","label":"Anime","reason":"Least recent coverage","status":"todo"},{"category":"sports","label":"Sports","reason":"Draft waiting for review","status":"draft-ready","draftRef":{"category":"sports","filename":"sports-draft.mdx"}},{"category":"finance","label":"Finance","reason":"Saved work needs attention","status":"needs-attention"}]}'
        """.write(to: plannerRoot.appendingPathComponent("Start OmniLede.command"), atomically: true, encoding: .utf8)
        let plannerConfiguration = try StudioConfiguration(studioURL: "https://studio.example.com", projectPath: plannerRoot.path)
        var plans: [[String: Any]] = []
        let planner = LocalPlannerController(configuration: plannerConfiguration) { plans.append($0) }
        _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
        try expect(plans.isEmpty && !FileManager.default.fileExists(atPath: plannerRoot.appendingPathComponent("writer-started").path), "does not refresh or write on construction")
        planner.refresh(requestId: "refresh-plan-12345")
        try expect(waitUntil { plans.last?["date"] as? String == "2026-10-03" }, "runs and parses the existing plan-snapshot protocol after an explicit refresh")
        try expect(plans.last?["requestId"] as? String == "refresh-plan-12345", "correlates the sanitized planner snapshot")
        try expect((plans.last?["tasks"] as? [[String: Any]])?.count == 3, "delivers exactly three validated local v1 tasks")
        try expect(planner.allowsPlannedWrite(category: "anime", planDate: "2026-10-03"), "binds an actionable category to the latest validated plan date")
        try expect(!planner.allowsPlannedWrite(category: "sports", planDate: "2026-10-03"), "does not authorize writing an already delivered plan task")
        try expect(!planner.allowsPlannedWrite(category: "anime", planDate: "2026-10-04"), "does not authorize a stale or injected plan date")
        let preservedAfterRefresh = try Data(contentsOf: preservedURL)
        try expect(preservedAfterRefresh == preserved, "reads the planner state without rewriting its bytes")
        try expect(!FileManager.default.fileExists(atPath: plannerRoot.appendingPathComponent("writer-started").path), "planner refresh never starts the writer action")

        try expect(planner.beginPlannedWrite(category: "anime", planDate: "2026-10-03") == .startNew, "derives a new run only from a validated todo task")
        try expect(planner.beginPlannedWrite(category: "anime", planDate: "2026-10-03") == nil, "consumes planner authorization while the write is in flight")
        planner.finishPlannedWrite(category: "anime", planDate: "2026-10-03", delivered: true)
        try expect(planner.beginPlannedWrite(category: "anime", planDate: "2026-10-03") == nil, "keeps delivered planner authorization consumed until a new snapshot")

        try expect(planner.beginPlannedWrite(category: "finance", planDate: "2026-10-03") == .resume, "derives resume from validated needs-attention state")
        try expect(planner.beginPlannedWrite(category: "finance", planDate: "2026-10-03") == nil, "suspends retry authorization while saved work is running")
        planner.finishPlannedWrite(category: "finance", planDate: "2026-10-03", delivered: false)
        try expect(planner.beginPlannedWrite(category: "finance", planDate: "2026-10-03") == .resume, "restores the correctly derived retry only after explicit error cleanup")
        planner.finishPlannedWrite(category: "finance", planDate: "2026-10-03", delivered: false)

        planner.refresh(requestId: "refresh-plan-again-123")
        try expect(waitUntil { plans.last?["requestId"] as? String == "refresh-plan-again-123" }, "accepts a new validated snapshot after delivery")
        try expect(planner.beginPlannedWrite(category: "anime", planDate: "2026-10-03") == .startNew, "only a new validated actionable snapshot restores delivered authorization")
        planner.finishPlannedWrite(category: "anime", planDate: "2026-10-03", delivered: false)
        try expect(planner.beginPlannedWrite(category: "anime", planDate: "2026-10-03") == .resume, "switches a failed first todo run to resume despite the stale todo snapshot")
        planner.finishPlannedWrite(category: "anime", planDate: "2026-10-03", delivered: false)

        planner.refresh(requestId: "refresh-todo-retry-123")
        try expect(waitUntil { plans.last?["requestId"] as? String == "refresh-todo-retry-123" }, "refreshes before the todo failure integration")

        try """
        #!/bin/bash
        if [ "${OMNILEDE_START_NEW:-}" = "true" ]; then
          touch "$PWD/saved-todo-state"
          printf '%s\n' '@omnilede {"status":"failed","stage":"content-conflict","percent":10,"deliveryStatus":"not-delivered"}'
          exit 17
        fi
        if [ ! -f "$PWD/saved-todo-state" ]; then exit 18; fi
        touch "$PWD/resumed-saved-work"
        printf '%s\n' '@omnilede {"status":"completed","stage":"delivery-verification","percent":100,"deliveryStatus":"delivered"}'
        """.write(to: plannerRoot.appendingPathComponent("Start OmniLede.command"), atomically: true, encoding: .utf8)
        var resumedStatuses: [[String: Any]] = []
        let resumeWriter = LocalWriterController(configuration: plannerConfiguration, completionSink: { category, _, planDate, outcome in
            if let planDate { planner.finishPlannedWrite(category: category, planDate: planDate, outcome: outcome) }
        }) { resumedStatuses.append($0) }
        let resumePolicy = StudioBridgePolicy(
            configuration: plannerConfiguration,
            plannedWriteMode: { planner.beginPlannedWrite(category: $0, planDate: $1) },
            start: { command in
                if !resumeWriter.perform(command), case let .write(category, _, planDate?, _) = command {
                    planner.finishPlannedWrite(category: category, planDate: planDate, outcome: .retryableFailure)
                }
            },
            reject: { _ in }
        )
        try expect(resumePolicy.handle(
            body: ["action": "write", "category": "anime", "planDate": "2026-10-03", "requestId": "first-todo-12345"],
            sourceURL: URL(string: "https://studio.example.com/today")!, isMainFrame: true, hasUserActivation: true
        ), "starts the first validated todo run as new")
        try expect(waitUntil { resumedStatuses.contains { $0["phase"] as? String == "content-conflict" } }, "observes the first todo failure after resumable state is created")
        try expect(resumePolicy.handle(
            body: ["action": "write", "category": "anime", "planDate": "2026-10-03", "requestId": "resume-saved-12345"],
            sourceURL: URL(string: "https://studio.example.com/today")!, isMainFrame: true, hasUserActivation: true
        ), "allows Try again after cleanup")
        try expect(waitUntil { resumedStatuses.contains { $0["delivery"] as? String == "delivered" } }, "resumable saved work reaches verified delivery instead of content conflict")
        try expect(FileManager.default.fileExists(atPath: plannerRoot.appendingPathComponent("resumed-saved-work").path), "omits start-new for a validated resumable plan task")
        try expect(!resumePolicy.handle(
            body: ["action": "write", "category": "anime", "planDate": "2026-10-03", "requestId": "duplicate-save-1234"],
            sourceURL: URL(string: "https://studio.example.com/today")!, isMainFrame: true, hasUserActivation: true
        ), "rejects a second click after verified delivery until another validated snapshot")
        try expect(resumePolicy.rejectionReason == "rejected-plan-binding", "exposes only the fixed rejection reason needed for a truthful unavailable response")
        planner.shutdown()

        let plannerFailureRoot = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("omnilede-planner-failures-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: plannerFailureRoot) }
        try FileManager.default.createDirectory(at: plannerFailureRoot, withIntermediateDirectories: true)
        let plannerFailureConfiguration = try StudioConfiguration(studioURL: "https://studio.example.com", projectPath: plannerFailureRoot.path)
        var plannerFailures: [[String: Any]] = []
        let failurePlanner = LocalPlannerController(configuration: plannerFailureConfiguration) { plannerFailures.append($0) }
        try "#!/bin/bash\nprintf '%s\\n' '@omnilede-plan {malformed}'\n".write(to: plannerFailureRoot.appendingPathComponent("Start OmniLede.command"), atomically: true, encoding: .utf8)
        failurePlanner.refresh(requestId: "malformed-plan-123")
        try expect(waitUntil { plannerFailures.last?["requestId"] as? String == "malformed-plan-123" }, "settles malformed planner output with a correlated failure")
        try expect(plannerFailures.last?["error"] as? String == "Daily plan could not be refreshed. Try again.", "uses fixed safe planner failure copy")
        try "#!/bin/bash\nprintf '%s\\n' '@omnilede-plan-error {\"message\":\"secret raw failure\"}'\nexit 1\n".write(to: plannerFailureRoot.appendingPathComponent("Start OmniLede.command"), atomically: true, encoding: .utf8)
        failurePlanner.refresh(requestId: "protocol-error-123")
        try expect(waitUntil { plannerFailures.last?["requestId"] as? String == "protocol-error-123" }, "settles the explicit planner error protocol without exposing its message")
        try "#!/bin/bash\nprintf '%s\\n' '@omnilede-plan {\"date\":\"2026-10-03\",\"completedCount\":1,\"totalTasks\":3,\"draftCount\":2,\"publishedCount\":24,\"tasks\":[{\"category\":\"anime\",\"label\":\"Anime\",\"reason\":\"Least recent coverage\",\"status\":\"todo\"},{\"category\":\"sports\",\"label\":\"Sports\",\"reason\":\"Draft waiting\",\"status\":\"draft-ready\"},{\"category\":\"finance\",\"label\":\"Finance\",\"reason\":\"Saved work\",\"status\":\"needs-attention\"}]}'\nexit 9\n".write(to: plannerFailureRoot.appendingPathComponent("Start OmniLede.command"), atomically: true, encoding: .utf8)
        failurePlanner.refresh(requestId: "nonzero-plan-1234")
        try expect(waitUntil { plannerFailures.last?["requestId"] as? String == "nonzero-plan-1234" }, "settles a nonzero planner even when it printed a valid snapshot")
        let launchFailurePlanner = LocalPlannerController(
            configuration: plannerFailureConfiguration,
            launcherExecutableURL: plannerFailureRoot.appendingPathComponent("missing-bash")
        ) { plannerFailures.append($0) }
        launchFailurePlanner.refresh(requestId: "launch-failure-123")
        try expect(waitUntil { plannerFailures.last?["requestId"] as? String == "launch-failure-123" }, "settles planner launch failure")
        failurePlanner.shutdown()
        launchFailurePlanner.shutdown()

        let reconciliationRoot = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("omnilede-reconciliation-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: reconciliationRoot) }
        try FileManager.default.createDirectory(at: reconciliationRoot, withIntermediateDirectories: true)
        try """
        #!/bin/bash
        if [ "$OMNILEDE_ACTION" = "plan-snapshot" ]; then
          printf '%s\n' '@omnilede-plan {"date":"2026-10-03","completedCount":1,"totalTasks":3,"draftCount":2,"publishedCount":24,"tasks":[{"category":"anime","label":"Anime","reason":"Least recent coverage","status":"todo"},{"category":"sports","label":"Sports","reason":"Draft waiting","status":"draft-ready"},{"category":"finance","label":"Finance","reason":"Saved work","status":"needs-attention"}]}'
          exit 0
        fi
        printf '%s\n' '@omnilede {"status":"completed","stage":"delivery-verification","percent":100,"deliveryStatus":"delivered"}'
        printf '%s\n' 'daily-plan reconciliation failed'
        exit 23
        """.write(to: reconciliationRoot.appendingPathComponent("Start OmniLede.command"), atomically: true, encoding: .utf8)
        let reconciliationConfiguration = try StudioConfiguration(studioURL: "https://studio.example.com", projectPath: reconciliationRoot.path)
        var reconciliationPlans: [[String: Any]] = []
        let reconciliationPlanner = LocalPlannerController(configuration: reconciliationConfiguration) { reconciliationPlans.append($0) }
        reconciliationPlanner.refresh(requestId: "reconcile-plan-123")
        try expect(waitUntil { reconciliationPlans.last?["date"] as? String == "2026-10-03" }, "loads the plan for reconciliation failure coverage")
        var reconciliationStatuses: [[String: Any]] = []
        let reconciliationWriter = LocalWriterController(configuration: reconciliationConfiguration, completionSink: { category, _, planDate, outcome in
            if let planDate { reconciliationPlanner.finishPlannedWrite(category: category, planDate: planDate, outcome: outcome) }
        }) { reconciliationStatuses.append($0) }
        let reconciliationPolicy = StudioBridgePolicy(
            configuration: reconciliationConfiguration,
            plannedWriteMode: { reconciliationPlanner.beginPlannedWrite(category: $0, planDate: $1) },
            start: { command in
                if !reconciliationWriter.perform(command), case let .write(category, _, planDate?, _) = command {
                    reconciliationPlanner.finishPlannedWrite(category: category, planDate: planDate, outcome: .retryableFailure)
                }
            }, reject: { _ in }
        )
        try expect(reconciliationPolicy.handle(
            body: ["action": "write", "category": "anime", "planDate": "2026-10-03", "requestId": "reconcile-write-12"],
            sourceURL: URL(string: "https://studio.example.com/today")!, isMainFrame: true, hasUserActivation: true
        ), "starts reconciliation failure fixture")
        try expect(waitUntil { reconciliationStatuses.last?["phase"] as? String == "delivery-reconciliation-failed" }, "does not publish an early delivered line before the process exit is known")
        try expect(!reconciliationStatuses.contains { $0["delivery"] as? String == "delivered" }, "never reports verified delivery when reconciliation exits nonzero")
        try expect(!reconciliationPolicy.handle(
            body: ["action": "write", "category": "anime", "planDate": "2026-10-03", "requestId": "reconcile-again-12"],
            sourceURL: URL(string: "https://studio.example.com/today")!, isMainFrame: true, hasUserActivation: true
        ), "keeps reconciliation failure consumed to prevent a duplicate article")
        reconciliationPlanner.refresh(requestId: "reconcile-refresh-12")
        try expect(waitUntil { reconciliationPlans.last?["requestId"] as? String == "reconcile-refresh-12" }, "can refresh after reconciliation failure")
        try expect(!reconciliationPolicy.handle(
            body: ["action": "write", "category": "anime", "planDate": "2026-10-03", "requestId": "reconcile-stale-12"],
            sourceURL: URL(string: "https://studio.example.com/today")!, isMainFrame: true, hasUserActivation: true
        ), "does not unlock a duplicate when refreshed plan state is still stale")
        reconciliationPlanner.shutdown()

        let plannedWriterRoot = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("omnilede-planned-writer-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: plannedWriterRoot) }
        try FileManager.default.createDirectory(at: plannedWriterRoot, withIntermediateDirectories: true)
        try """
        #!/bin/bash
        printf '%s' "$OMNILEDE_PLAN_DATE" > "$PWD/received-plan-date"
        printf '%s' "${OMNILEDE_START_NEW-unset}" > "$PWD/received-write-mode"
        printf '%s\n' '@omnilede {"status":"completed","stage":"delivery-verification","percent":100,"deliveryStatus":"delivered"}'
        """.write(to: plannedWriterRoot.appendingPathComponent("Start OmniLede.command"), atomically: true, encoding: .utf8)
        let plannedWriterConfiguration = try StudioConfiguration(studioURL: "https://studio.example.com", projectPath: plannedWriterRoot.path)
        let plannedWriter = LocalWriterController(configuration: plannedWriterConfiguration) { _ in }
        plannedWriter.perform(.write(category: "anime", requestId: "planned-run-12345", planDate: "2026-10-03", mode: .resume))
        let receivedPlanDate = plannedWriterRoot.appendingPathComponent("received-plan-date")
        try expect(waitUntil { FileManager.default.fileExists(atPath: receivedPlanDate.path) }, "starts an explicitly bound daily-plan writer")
        let receivedDate = try String(contentsOf: receivedPlanDate, encoding: .utf8)
        try expect(receivedDate == "2026-10-03", "passes the exact daily-plan date to local-writer")
        let receivedMode = try String(contentsOf: plannedWriterRoot.appendingPathComponent("received-write-mode"), encoding: .utf8)
        try expect(receivedMode == "unset", "a validated retry resumes saved work without forcing a conflicting new article")

        let categoryWriterRoot = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("omnilede-category-writer-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: categoryWriterRoot) }
        try FileManager.default.createDirectory(at: categoryWriterRoot, withIntermediateDirectories: true)
        try """
        #!/bin/bash
        printf '%s' "${OMNILEDE_PLAN_DATE-unset}" > "$PWD/category-plan-date"
        printf '%s\n' '@omnilede {"status":"completed","stage":"delivery-verification","percent":100,"deliveryStatus":"delivered"}'
        """.write(to: categoryWriterRoot.appendingPathComponent("Start OmniLede.command"), atomically: true, encoding: .utf8)
        setenv("OMNILEDE_PLAN_DATE", "2026-10-03", 1)
        let categoryWriterConfiguration = try StudioConfiguration(studioURL: "https://studio.example.com", projectPath: categoryWriterRoot.path)
        let categoryWriter = LocalWriterController(configuration: categoryWriterConfiguration) { _ in }
        categoryWriter.perform(.write(category: "sports", requestId: "category-run-1234"))
        let categoryPlanDate = categoryWriterRoot.appendingPathComponent("category-plan-date")
        try expect(waitUntil { FileManager.default.fileExists(atPath: categoryPlanDate.path) }, "starts a Categories writer without planner ownership")
        let receivedCategoryDate = try String(contentsOf: categoryPlanDate, encoding: .utf8)
        unsetenv("OMNILEDE_PLAN_DATE")
        try expect(receivedCategoryDate == "unset", "an undated Categories write cannot inherit or mutate daily-plan state")

        let cancelRoot = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("omnilede-planner-cancel-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: cancelRoot) }
        try FileManager.default.createDirectory(at: cancelRoot.appendingPathComponent("node_modules"), withIntermediateDirectories: true)
        try FileManager.default.copyItem(
            at: URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("Start OmniLede.command"),
            to: cancelRoot.appendingPathComponent("Start OmniLede.command")
        )
        let slowPlanner = cancelRoot.appendingPathComponent("slow-planner.sh")
        try """
        #!/bin/bash
        trap 'exit 0' TERM
        touch planner-started
        sleep 1
        touch planner-wrote-after-shutdown
        """.write(to: slowPlanner, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: slowPlanner.path)
        setenv("OMNILEDE_PLANNER_EXECUTABLE", slowPlanner.path, 1)
        defer { unsetenv("OMNILEDE_PLANNER_EXECUTABLE") }
        let cancelConfiguration = try StudioConfiguration(studioURL: "https://studio.example.com", projectPath: cancelRoot.path)
        let cancelPlanner = LocalPlannerController(configuration: cancelConfiguration) { _ in }
        cancelPlanner.refresh(requestId: "cancel-plan-12345")
        try expect(waitUntil { FileManager.default.fileExists(atPath: cancelRoot.appendingPathComponent("planner-started").path) }, "starts the real planner child")
        cancelPlanner.shutdown()
        _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(1.3))
        try expect(!FileManager.default.fileExists(atPath: cancelRoot.appendingPathComponent("planner-wrote-after-shutdown").path), "shutdown terminates the actual planner child before it can continue")
        print("Studio bridge security tests passed")
    }
}
