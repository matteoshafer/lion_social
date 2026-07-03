import { useState, useEffect } from "react";
import { Tabs } from "expo-router";
import { View, Text, StyleSheet, Platform } from "react-native";
import Colors from "../../src/constants/colors";
import { useNotifications } from "../../src/hooks/use-notifications";
import { supabase } from "../../src/lib/supabase";
import SignInPromptModal from "../../src/components/SignInPromptModal";

/**
 * Custom tab bar icon with label
 */
function TabIcon({
  icon,
  label,
  focused,
  isCreate,
  badge,
}: {
  icon: string;
  label: string;
  focused: boolean;
  isCreate?: boolean;
  badge?: number;
}) {
  if (isCreate) {
    return (
      <View style={styles.createButtonOuter}>
        <View
          style={[
            styles.createButton,
            focused && styles.createButtonActive,
          ]}
        >
          <Text style={styles.createButtonIcon}>+</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tabIconContainer}>
      <View style={styles.iconWrapper}>
        <Text
          style={[
            styles.tabIcon,
            { color: focused ? Colors.gold : Colors.grayDark },
          ]}
        >
          {icon}
        </Text>
        {badge != null && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        )}
      </View>
      <Text
        style={[
          styles.tabLabel,
          { color: focused ? Colors.gold : Colors.grayDark },
          focused && styles.tabLabelActive,
        ]}
      >
        {label}
      </Text>
      {focused && <View style={styles.activeIndicator} />}
    </View>
  );
}

export default function TabLayout() {
  const { unreadCount } = useNotifications();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const authed = !!session;
      setIsAuthenticated(authed);
      // Show welcome sign-in prompt 2s after open if not logged in
      if (!authed) setTimeout(() => setShowSignInModal(true), 2000);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const requireAuth = (e: { preventDefault: () => void }) => {
    if (isAuthenticated === false) {
      e.preventDefault();
      setShowSignInModal(true);
    }
  };

  return (
    <>
    <SignInPromptModal visible={showSignInModal} onClose={() => setShowSignInModal(false)} />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.grayDark,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🏠" label="Home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🔍" label="Explore" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Create",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="+" label="Create" focused={focused} isCreate />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🔔" label="Alerts" focused={focused} badge={unreadCount} />
          ),
        }}
        listeners={{ tabPress: requireAuth }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="👤" label="Profile" focused={focused} />
          ),
        }}
        listeners={{ tabPress: requireAuth }}
      />
    </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.dark900,
    borderTopColor: Colors.dark700,
    borderTopWidth: 0.5,
    height: Platform.OS === "ios" ? 88 : 68,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 28 : 8,
    elevation: 0,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  tabIconContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minWidth: 48,
  },
  iconWrapper: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.dark900,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 12,
  },
  tabIcon: {
    fontSize: 20,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    fontWeight: "700",
  },
  activeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gold,
    marginTop: 2,
  },
  createButtonOuter: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -12,
  },
  createButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gold,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  createButtonActive: {
    backgroundColor: Colors.goldLight,
    transform: [{ scale: 1.05 }],
  },
  createButtonIcon: {
    fontSize: 28,
    fontWeight: "300",
    color: Colors.black,
    marginTop: -2,
  },
});
