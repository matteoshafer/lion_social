import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import type { Session } from "@supabase/supabase-js";
import Colors from "../src/constants/colors";
import { supabase } from "../src/lib/supabase";

function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => setSession(null), 5000);
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(timeout);
      setSession(session);
    });
    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    const inAuthGroup = segments[0] === "(auth)";
    // The password-recovery deep link establishes a session; don't kick the
    // user off the reset screen before they've set a new password.
    const onResetPassword = segments[1] === "reset-password";
    // Redirect authenticated users away from auth screens
    if (session && inAuthGroup && !onResetPassword) {
      router.replace("/(tabs)");
    }
    // Unauthenticated users can browse freely — tab layout shows sign-in prompts for gated screens
  }, [session, segments]);

  if (session === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.gold} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={Colors.black} />
        <AuthGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Colors.black },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="auth/callback" />
            <Stack.Screen name="post/[id]" />
            <Stack.Screen name="messages/[userId]" />
            <Stack.Screen name="group/[groupId]" />
            <Stack.Screen name="create-group" />
            <Stack.Screen name="edit-profile" />
          </Stack>
        </AuthGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  loading: { flex: 1, backgroundColor: Colors.black, alignItems: "center", justifyContent: "center" },
});
