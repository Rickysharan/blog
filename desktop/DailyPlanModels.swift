import Foundation

enum DailyTaskStatus: String, Decodable {
    case todo
    case writing
    case draftReady = "draft-ready"
    case published
    case needsAttention = "needs-attention"

    var label: String {
        switch self {
        case .todo: return "To do"
        case .writing: return "Writing"
        case .draftReady: return "Draft ready"
        case .published: return "Published"
        case .needsAttention: return "Needs attention"
        }
    }

    var isActionable: Bool {
        self == .todo || self == .needsAttention
    }
}

struct DailyDraftRef: Decodable {
    let category: String
    let filename: String
}

struct DailyPlanTask: Decodable {
    let category: String
    let label: String
    let reason: String
    let status: DailyTaskStatus
    let draftRef: DailyDraftRef?
}

struct DailyPlanSnapshot: Decodable {
    let date: String
    let completedCount: Int
    let totalTasks: Int
    let draftCount: Int
    let publishedCount: Int
    let tasks: [DailyPlanTask]
}

struct DailyPlanError: Decodable {
    let message: String
}
