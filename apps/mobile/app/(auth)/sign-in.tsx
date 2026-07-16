import { useState } from "react";
import {
  View, Text, TextInput, Pressable, KeyboardAvoidingView,
  ScrollView, ActivityIndicator, Alert, Platform, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "../../src/constants/colors";
import { supabase } from "../../src/lib/supabase";

export default function SignInScreen() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (!identifier.trim() || !password) {
      Alert.alert("Missing fields", "Please enter your email or username and password.");
      return;
    }
    setLoading(true);

    let emailToUse = identifier.trim().toLowerCase();

    // If no @ sign, treat as username — look up email via security definer RPC (bypasses RLS)
    if (!emailToUse.includes("@")) {
      const { data: email, error: lookupError } = await supabase
        .rpc("get_email_by_username", { p_username: emailToUse });

      if (lookupError || !email) {
        setLoading(false);
        Alert.alert("Sign in failed", "No account found with that username.");
        return;
      }
      emailToUse = email;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password,
    });
    setLoading(false);
    if (error) {
      Alert.alert("Sign in failed", error.message);
    }
    // On success, AuthGate in _layout.tsx handles the redirect automatically
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
            <Text style={styles.formTitle}>Welcome back</Text>
            <Text style={styles.formSubtitle}>Sign in to continue your journey</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL OR USERNAME</Text>
              <TextInput
                style={[styles.input, focusedField === "identifier" && styles.inputFocused]}
                value={identifier}
                onChangeText={setIdentifier}
                onFocus={() => setFocusedField("identifier")}
                onBlur={() => setFocusedField(null)}
                placeholder="you@example.com or your_handle"
                placeholderTextColor={Colors.grayDark}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor={Colors.gold}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PASSWORD</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput, focusedField === "password" && styles.inputFocused]}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.grayDark}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  selectionColor={Colors.gold}
                />
                <Pressable style={[styles.eyeButton, focusedField === "password" && styles.eyeButtonFocused]} onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                  <Text style={styles.eyeIcon}>{showPassword ? "🙈" : "👁"}</Text>
                </Pressable>
              </View>
            </View>

            <Pressable onPress={() => router.push('/(auth)/forgot-password')} style={styles.forgotBtn}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>

            <Pressable
              style={[styles.signInButton, loading && styles.buttonDisabled]}
              onPress={handleSignIn}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.black} />
              ) : (
                <Text style={styles.signInButtonText}>SIGN IN</Text>
              )}
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable style={styles.signUpLink} onPress={() => router.push("/(auth)/sign-up")}>
              <Text style={styles.signUpLinkText}>
                Don't have an account?{" "}
                <Text style={styles.signUpLinkAccent}>Create one</Text>
              </Text>
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
  inputFocused: { borderColor: Colors.gold },
  passwordRow: { flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 },
  eyeButton: {
    backgroundColor: Colors.dark800, borderWidth: 1, borderLeftWidth: 0,
    borderColor: Colors.dark700, paddingHorizontal: 16, paddingVertical: 16,
    borderTopRightRadius: 14, borderBottomRightRadius: 14,
  },
  eyeButtonFocused: { borderColor: Colors.gold },
  eyeIcon: { fontSize: 16 },

  forgotBtn: { alignSelf: 'flex-end', marginTop: 6, marginBottom: 16 },
  forgotText: { color: Colors.gray, fontSize: 13, textDecorationLine: 'underline' },

  signInButton: {
    backgroundColor: Colors.gold, borderRadius: 16, paddingVertical: 18,
    alignItems: "center", marginTop: 8,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  signInButtonText: { fontSize: 16, fontWeight: "800", color: Colors.black, letterSpacing: 1.5 },

  divider: { flexDirection: "row", alignItems: "center", marginVertical: 24, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.dark700 },
  dividerText: { fontSize: 13, color: Colors.grayDark },

  signUpLink: { alignItems: "center" },
  signUpLinkText: { fontSize: 15, color: Colors.gray },
  signUpLinkAccent: { color: Colors.gold, fontWeight: "700" },
});
