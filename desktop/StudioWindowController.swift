import AppKit
import WebKit

final class StudioWindowController: NSWindowController, WKNavigationDelegate, WKUIDelegate {
    private let studioConfiguration: StudioConfiguration
    private let bridge: StudioBridge
    private let navigationPolicy: StudioNavigationPolicy
    private(set) var webView: WKWebView!

    init(configuration: StudioConfiguration) {
        self.studioConfiguration = configuration
        self.bridge = StudioBridge(configuration: configuration)
        let auditLog = StudioAuditLog(projectPath: configuration.projectPath)
        self.navigationPolicy = StudioNavigationPolicy(configuration: configuration) { reason in
            auditLog.append("navigation-rejection \(reason)\n")
        }
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 780),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "OmniLede Studio"
        window.minSize = NSSize(width: 760, height: 560)
        window.center()
        super.init(window: window)
        configureWebView()
    }

    required init?(coder: NSCoder) { nil }

    private func configureWebView() {
        let userContent = WKUserContentController()
        let capability = "Object.defineProperty(window,'__OMNILEDE_NATIVE__',{value:Object.freeze({available:true}),writable:false,configurable:false});"
        userContent.addUserScript(WKUserScript(source: capability, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        userContent.add(bridge, name: "omnilede")
        let webConfiguration = WKWebViewConfiguration()
        webConfiguration.userContentController = userContent
        webConfiguration.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: webConfiguration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsMagnification = true
        bridge.webView = webView
        window?.contentView = webView
        webView.load(URLRequest(url: studioConfiguration.studioURL, cachePolicy: .reloadRevalidatingCacheData))
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        if studioConfiguration.allowsExternalGoogleOAuth(url: url, isMainFrame: isMainFrame) {
            NSWorkspace.shared.open(url)
            webView.load(URLRequest(url: studioConfiguration.externalSignInWaitURL, cachePolicy: .reloadRevalidatingCacheData))
            decisionHandler(.cancel)
            return
        }
        if navigationPolicy.allows(url: url, isMainFrame: isMainFrame) {
            if navigationAction.targetFrame == nil { webView.load(navigationAction.request); decisionHandler(.cancel) }
            else { decisionHandler(.allow) }
            return
        }
        if navigationAction.navigationType == .linkActivated, ["https", "http"].contains(url.scheme?.lowercased() ?? ""), url.user == nil, url.password == nil {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    @discardableResult
    func handleAuthenticationCallback(_ url: URL) -> Bool {
        guard let callback = studioConfiguration.studioCallbackURL(from: url) else { return false }
        webView.load(URLRequest(url: callback, cachePolicy: .reloadRevalidatingCacheData))
        showWindow(nil)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard let url = navigationResponse.response.url,
              navigationPolicy.allows(url: url, isMainFrame: navigationResponse.isForMainFrame) else {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if navigationPolicy.allows(url: url, isMainFrame: true) { webView.load(navigationAction.request) }
        else if ["https", "http"].contains(url.scheme?.lowercased() ?? ""), url.user == nil, url.password == nil { NSWorkspace.shared.open(url) }
        return nil
    }

    func shutdown() {
        bridge.shutdown()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "omnilede")
        webView.stopLoading()
    }
}
