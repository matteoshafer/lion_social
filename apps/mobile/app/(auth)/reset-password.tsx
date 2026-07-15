import { useEffect, useState } from "react";
import {
  View, Text, TextInput, Pressable, KeyboardAvoidingView,
  ScrollView, ActivityIndicator, Alert, Platform, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import Colors from "../../src/constants/colors";
import { supabase } from "../../src/lib/supabase";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // The client uses PKCE with detectSessionInUrl disabled, so the recovery
  // link arrives as gains://reset-password?code=... and we must exchange the
  // code for a session ourselves (same pattern as auth/callback.tsx).
  useEffect(() => {
    Linking.getInitialURL().then(async (url) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      const code = parsed.queryParams?.code as string | undefined;
      if (!code) return;
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        Alert.alert(
          "Link expired",
          "This reset link is invalid or has expired. Please request a new one.",
        );
      }
    });
  }, []);

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert("Missing fields", "Please enter and confirm your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Passwords don't match", "Please make sure both passwords are the same.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      Alert.alert("Update failed", error.message);
      return;
    }
    Alert.alert("Password updated!", "You can now sign in with your new password.");
    router.replace("/(auth)/sign-in");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoSection}>
            <Text style={styles.logoText}>GAINS</Text>
            <View style={styles.logoAccent} />
            <Text style={styles.logoSubtitle}>Your wellness community</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.formTitle}>Reset Password</Text>
            <Text style={styles.formSubtitle}>Choose a new password for your account</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NEW PASSWORD</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.grayDark}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  selectionColor={Colors.gold}
                />
                <Pressable style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                  <Text style={styles.eyeIcon}>{showPassword ? "🙈" : "👁"}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.grayDark}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                selectionColor={Colors.gold}
              />
            </View>

            <Pressable
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleUpdatePassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.black} />
              ) : (
                <Text style={styles.primaryButtonText}>UPDATE PASSWORD</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },

  logoSection: { alignItems: "center", paddingTop: 60, paddingBottom: 48 },
  logoText: { fontSize: 40, fontWeight: "800", color: Colors.gold, letterSpacing: 8 },
  logoAccent: { width: 40, height: 3, backgroundColor: Colors.gold, borderRadius: 2, marginTop: 8, opacity: 0.6 },
  logoSubtitle: { fontSize: 14, color: Colors.gray, marginTop: 12, letterSpacing: 0.5 },

  form: { flex: 1 },
  formTitle: { fontSize: 26, fontWeight: "800", color: Colors.white, marginBottom: 6 },
  formSubtitle: { fontSize: 15, color: Colors.gray, marginBottom: 32 },

  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 11, fontWeight: "700", color: Colors.gold, letterSpacing: 1.5, marginBottom: 8 },
  input: {
    backgroundColor: Colors.dark800, borderRadius: 14, paddingHorizontal: 16,
    paddingVertical: 16, fontSize: 15, color: Colors.white,
    borderWidth: 1, borderColor: Colors.dark700,
  },
  passwordRow: { flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 },
  eyeButton: {
    backgroundColor: Colors.dark800, borderWidth: 1, borderLeftWidth: 0,
    borderColor: Colors.dark700, paddingHorizontal: 16, paddingVertical: 16,
    borderTopRightRadius: 14, borderBottomRightRadius: 14,
  },
  eyeIcon: { fontSize: 16 },

  primaryButton: {
    backgroundColor: Colors.gold, borderRadius: 16, paddingVertical: 18,
    alignItems: "center", marginTop: 8,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { fontSize: 16, fontWeight: "800", color: Colors.black, letterSpacing: 1.5 },
});
