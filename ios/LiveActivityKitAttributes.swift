//
//  LiveActivityKitAttributes.swift
//  react-native-live-activity-kit
//
//  CANONICAL, SHARED SOURCE OF TRUTH for the Live Activity's attributes and
//  content state. This exact file is compiled into TWO targets:
//
//    1. The app (via this pod) — so `HybridLiveActivityKit` can call
//       `Activity<LiveActivityKitAttributes>.request(...)`.
//    2. The widget extension — the config plugin copies THIS file into the
//       generated extension so its SwiftUI `ActivityConfiguration(for:)` renders
//       the same type.
//
//  ActivityKit matches the app side to the extension side by the **bare type
//  name** (`LiveActivityKitAttributes`) and the `ContentState` Codable shape, so
//  the two copies MUST stay byte-identical. The field names below are also the
//  exact keys used on the JS side (`LiveActivityState`) and in the APNs
//  `aps.content-state` payload sent by `react-native-live-activity-kit/server`.
//  Changing a field here means changing it in all four places.
//
//  DO NOT add stored properties without a default or `Optional`, or older
//  encoded states will fail to decode.
//

import ActivityKit
import Foundation

public struct LiveActivityKitAttributes: ActivityAttributes {
  /// The mutable, updatable content. Encoded size must stay under ~4 KB.
  public struct ContentState: Codable, Hashable {
    /// Primary headline (Lock Screen + expanded Dynamic Island).
    public var title: String
    /// Secondary line under the title.
    public var subtitle: String?
    /// Longer descriptive text shown on the Lock Screen.
    public var body: String?
    /// Short status label, e.g. "On the way".
    public var status: String?
    /// Progress in [0, 1]; rendered as a progress bar when present.
    public var progress: Double?
    /// Epoch **milliseconds** used for a live timer / countdown.
    public var date: Double?
    /// SF Symbol name rendered as the glyph (e.g. "bicycle").
    public var imageName: String?
    /// Accent color as "#RRGGBB" / "#AARRGGBB".
    public var tintColorHex: String?
    /// Compact Dynamic Island leading text.
    public var leading: String?
    /// Compact Dynamic Island trailing text.
    public var trailing: String?
    /// Custom string key/values the template may render.
    public var extra: [String: String]?

    public init(
      title: String,
      subtitle: String? = nil,
      body: String? = nil,
      status: String? = nil,
      progress: Double? = nil,
      date: Double? = nil,
      imageName: String? = nil,
      tintColorHex: String? = nil,
      leading: String? = nil,
      trailing: String? = nil,
      extra: [String: String]? = nil
    ) {
      self.title = title
      self.subtitle = subtitle
      self.body = body
      self.status = status
      self.progress = progress
      self.date = date
      self.imageName = imageName
      self.tintColorHex = tintColorHex
      self.leading = leading
      self.trailing = trailing
      self.extra = extra
    }
  }

  /// Logical name of the activity, e.g. "Order #1234". Immutable for its life.
  public var name: String
  /// Custom immutable string key/values.
  public var extra: [String: String]?

  public init(name: String, extra: [String: String]? = nil) {
    self.name = name
    self.extra = extra
  }
}
