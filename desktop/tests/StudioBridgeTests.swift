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
        let configuration = try StudioConfiguration(
            studioURL: "https://studio.example.com/categories",
            projectPath: "/tmp/omnilede"
        )
        try expect(configuration.origin.absoluteString == "https://studio.example.com", "normalizes the configured origin")
        try expect(configuration.allows(url: URL(string: "https://studio.example.com/today")!), "allows an exact-origin path")
        try expect(!configuration.allows(url: URL(string: "https://studio.example.com.evil.test/today")!), "rejects a host-prefix attack")
        try expect(!configuration.allows(url: URL(string: "https://evil.example/today")!), "rejects an unrelated origin")
        try expect(!configuration.allows(url: URL(string: "https://user:pass@studio.example.com/today")!), "rejects URL credentials")
        try expect(!configuration.allows(url: URL(string: "https://studio.example.com:444/today")!), "rejects a different effective port")
        try expect(configuration.allows(url: URL(string: "https://studio.example.com:443/today")!), "accepts the equivalent HTTPS default port")

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
        try expect(starts.filter { if case .write = $0 { return true }; return false }.count == 6, "accepts exactly all six writer categories")
        try expect(bridge.handle(body: ["action": "cancel", "requestId": "cancel-12345678"], sourceURL: URL(string: "https://studio.example.com/categories")!, isMainFrame: true, hasUserActivation: true), "accepts activated cancellation")
        try expect(bridge.handle(body: ["action": "refresh", "requestId": "refresh-12345678"], sourceURL: URL(string: "https://studio.example.com/categories")!, isMainFrame: true, hasUserActivation: true), "accepts activated status refresh")

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
        try expect(sanitized?["delivery"] as? String == "pending", "keeps delivery state")
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
        try expect(starts.filter { if case .write = $0 { return true }; return false }.count == 6, "hostile navigation does not create another writer command")

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
        while :; do sleep 0.1; done
        """.write(to: launcher, atomically: true, encoding: .utf8)
        let writerConfiguration = try StudioConfiguration(studioURL: "https://studio.example.com", projectPath: writerRoot.path)
        var writerStatuses: [[String: Any]] = []
        let writer = LocalWriterController(configuration: writerConfiguration) { writerStatuses.append($0) }
        writer.perform(.write(category: "sports", requestId: "writer-one-12345"))
        try expect(waitUntil { FileManager.default.fileExists(atPath: writerRoot.appendingPathComponent("started").path) }, "starts the explicit writer process")
        writer.perform(.write(category: "anime", requestId: "writer-two-12345"))
        try expect(writerStatuses.contains { $0["requestId"] as? String == "writer-two-12345" && $0["phase"] as? String == "already-running" }, "keeps one writer process at a time")
        writer.perform(.refresh(requestId: "refresh-active-12345"))
        try expect(writerStatuses.last?["requestId"] as? String == "writer-one-12345", "refresh retains the active writer instead of a rejected second request")
        writer.perform(.cancel(requestId: "wrong-request-12345"))
        _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.15))
        try expect(!FileManager.default.fileExists(atPath: writerRoot.appendingPathComponent("cancelled").path), "does not cancel for a stale request ID")
        writer.perform(.cancel(requestId: "writer-one-12345"))
        try expect(waitUntil { FileManager.default.fileExists(atPath: writerRoot.appendingPathComponent("cancelled").path) }, "cancels the owned writer process")
        try expect(waitUntil { writerStatuses.contains { $0["requestId"] as? String == "writer-one-12345" && $0["phase"] as? String == "failed" } }, "reports safe terminal status and releases cancellation resources")

        try? FileManager.default.removeItem(at: writerRoot.appendingPathComponent("started"))
        try? FileManager.default.removeItem(at: writerRoot.appendingPathComponent("cancelled"))
        writer.perform(.write(category: "finance", requestId: "writer-three-12345"))
        try expect(waitUntil { FileManager.default.fileExists(atPath: writerRoot.appendingPathComponent("started").path) }, "admits another writer after cleanup")
        writer.shutdown()
        try expect(waitUntil { FileManager.default.fileExists(atPath: writerRoot.appendingPathComponent("cancelled").path) }, "shutdown cancels the remaining writer")
        print("Studio bridge security tests passed")
    }
}
