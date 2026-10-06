import Foundation

enum StudioConfigurationError: Error, CustomStringConvertible {
    case missing(String)
    case unsafeURL

    var description: String {
        switch self {
        case let .missing(key): return "Missing \(key) in OmniLede.app. Reinstall the app."
        case .unsafeURL: return "OmniLede Studio must use a public HTTPS origin without credentials."
        }
    }
}

struct StudioConfiguration {
    static let callbackScheme = "com.rickysharan.omnilede"

    let studioURL: URL
    let origin: URL
    let supabaseAuthOrigin: URL?
    let projectPath: String

    init(studioURL rawURL: String?, supabaseAuthURL rawSupabaseURL: String? = nil, projectPath: String) throws {
        guard let rawURL, !rawURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw StudioConfigurationError.missing("OmniLedeStudioURL")
        }
        guard
            let components = URLComponents(string: rawURL),
            components.scheme?.lowercased() == "https",
            components.user == nil,
            components.password == nil,
            let host = components.host?.lowercased(),
            !host.isEmpty,
            components.port == nil || components.port == 443,
            !Self.isUnsafeHost(host),
            let url = components.url
        else { throw StudioConfigurationError.unsafeURL }

        var originComponents = URLComponents()
        originComponents.scheme = "https"
        originComponents.host = host
        guard let origin = originComponents.url else { throw StudioConfigurationError.unsafeURL }
        self.studioURL = url
        self.origin = origin
        if let rawSupabaseURL {
            guard
                let authComponents = URLComponents(string: rawSupabaseURL),
                authComponents.scheme?.lowercased() == "https",
                authComponents.user == nil,
                authComponents.password == nil,
                let authHost = authComponents.host?.lowercased(),
                authHost.hasSuffix(".supabase.co"),
                authComponents.port == nil || authComponents.port == 443,
                authComponents.path.isEmpty || authComponents.path == "/",
                authComponents.query == nil,
                authComponents.fragment == nil
            else { throw StudioConfigurationError.unsafeURL }
            var authOriginComponents = URLComponents()
            authOriginComponents.scheme = "https"
            authOriginComponents.host = authHost
            guard let authOrigin = authOriginComponents.url else { throw StudioConfigurationError.unsafeURL }
            self.supabaseAuthOrigin = authOrigin
        } else {
            self.supabaseAuthOrigin = nil
        }
        self.projectPath = projectPath
    }

    init(bundle: Bundle = .main) throws {
        let studioURL = bundle.object(forInfoDictionaryKey: "OmniLedeStudioURL") as? String
        guard let supabaseAuthURL = bundle.object(forInfoDictionaryKey: "OmniLedeSupabaseAuthURL") as? String else {
            throw StudioConfigurationError.missing("OmniLedeSupabaseAuthURL")
        }
        guard let projectPath = bundle.object(forInfoDictionaryKey: "OmniLedeProjectPath") as? String else {
            throw StudioConfigurationError.missing("OmniLedeProjectPath")
        }
        try self.init(studioURL: studioURL, supabaseAuthURL: supabaseAuthURL, projectPath: projectPath)
    }

    func allows(url: URL) -> Bool {
        guard url.user == nil, url.password == nil else { return false }
        return url.scheme?.lowercased() == "https"
            && url.host?.lowercased() == origin.host?.lowercased()
            && (url.port ?? 443) == 443
    }

    func allowsRedirect(from: URL, to: URL) -> Bool {
        allows(url: from) && allows(url: to)
    }

    func allowsExternalGoogleOAuth(url: URL, isMainFrame: Bool) -> Bool {
        guard isMainFrame, let authOrigin = supabaseAuthOrigin,
              url.scheme?.lowercased() == "https",
              url.user == nil, url.password == nil,
              url.host?.lowercased() == authOrigin.host?.lowercased(),
              (url.port ?? 443) == 443,
              url.path == "/auth/v1/authorize",
              url.fragment == nil,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else { return false }
        let providers = queryItems.filter { $0.name == "provider" }.compactMap(\.value)
        let redirects = queryItems.filter { $0.name == "redirect_to" }.compactMap(\.value)
        guard providers == ["google"], redirects.count == 1,
              let redirect = URL(string: redirects[0]),
              redirect.scheme?.lowercased() == "https",
              redirect.user == nil, redirect.password == nil,
              redirect.host?.lowercased() == origin.host?.lowercased(),
              (redirect.port ?? 443) == 443,
              redirect.path == "/auth/native/relay",
              redirect.query == nil, redirect.fragment == nil else { return false }
        return true
    }

    func studioCallbackURL(from nativeURL: URL) -> URL? {
        guard nativeURL.scheme?.lowercased() == Self.callbackScheme,
              nativeURL.host?.lowercased() == "auth-callback",
              nativeURL.user == nil, nativeURL.password == nil, nativeURL.port == nil,
              nativeURL.path.isEmpty, nativeURL.fragment == nil,
              let nativeComponents = URLComponents(url: nativeURL, resolvingAgainstBaseURL: false),
              let queryItems = nativeComponents.queryItems else { return nil }
        let codes = queryItems.filter { $0.name == "code" }.compactMap(\.value)
        guard queryItems.count == 1, codes.count == 1,
              !codes[0].isEmpty, codes[0].count <= 2_048 else { return nil }
        var callback = URLComponents(url: origin, resolvingAgainstBaseURL: false)
        callback?.path = "/auth/callback"
        callback?.queryItems = [
            URLQueryItem(name: "code", value: codes[0]),
            URLQueryItem(name: "next", value: "/overview")
        ]
        return callback?.url
    }

    var externalSignInWaitURL: URL {
        var components = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
        components.path = "/login"
        components.queryItems = [URLQueryItem(name: "external", value: "1")]
        return components.url!
    }

    private static func isUnsafeHost(_ host: String) -> Bool {
        if !host.contains(".") || host.hasSuffix(".")
            || host == "localhost" || host.hasSuffix(".localhost") || host.hasSuffix(".local")
            || host.hasSuffix(".internal") || host.hasSuffix(".test") || host.hasSuffix(".invalid")
            || host.hasSuffix(".example") || host.hasSuffix(".home.arpa") || host.hasSuffix(".onion") { return true }
        if host.contains(":") { return true }
        let octets = host.split(separator: ".").compactMap { Int($0) }
        if octets.count == 4, octets.allSatisfy({ (0...255).contains($0) }) {
            let first = octets[0], second = octets[1]
            return first == 0 || first == 10 || first == 127 || first >= 224
                || (first == 169 && second == 254)
                || (first == 172 && (16...31).contains(second))
                || (first == 192 && second == 168)
                || (first == 100 && (64...127).contains(second))
                || (first == 192 && second == 0)
                || (first == 198 && (18...19).contains(second))
                || (first == 198 && second == 51)
                || (first == 203 && second == 0)
        }
        if host.unicodeScalars.allSatisfy(CharacterSet.decimalDigits.contains) { return true }
        return false
    }
}

final class StudioNavigationPolicy {
    private let configuration: StudioConfiguration
    private let reject: (String) -> Void

    init(configuration: StudioConfiguration, reject: @escaping (String) -> Void) {
        self.configuration = configuration
        self.reject = reject
    }

    func allows(url: URL, isMainFrame: Bool, redirectFrom: URL? = nil) -> Bool {
        guard isMainFrame else { reject("rejected-navigation-frame"); return false }
        if let redirectFrom, !configuration.allowsRedirect(from: redirectFrom, to: url) {
            reject("rejected-navigation-redirect")
            return false
        }
        guard configuration.allows(url: url) else {
            reject("rejected-navigation-origin")
            return false
        }
        return true
    }
}
