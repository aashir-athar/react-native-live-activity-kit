//
//  LiveActivityKitWidgetBundle.swift
//  react-native-live-activity-kit — generated widget extension
//
//  The `@main` entry point for the widget extension. It exposes the Live
//  Activity widget. If you add Home Screen / Lock Screen widgets later, declare
//  them here alongside `LiveActivityKitLiveActivity()`.
//

import SwiftUI
import WidgetKit

@main
struct LiveActivityKitWidgetBundle: WidgetBundle {
  var body: some Widget {
    if #available(iOS 16.1, *) {
      LiveActivityKitLiveActivity()
    }
  }
}
