import { useState } from "react";
import {
  View, Text, TextInput, Pressable, KeyboardAvoidingView,
  ScrollView, ActivityIndicator, Alert, Platform, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "../../src/constants/colors";
import { supabase } from "../../src/lib/supabase";

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSignUp = async () => {
    if (!email.trim() || !username.trim() || !password) {
      Alert.alert("Missing fields", "Email, username, and password are required.");
      return;
    }
    if (username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      Alert.alert("Invalid username", "Username must be at least 3 characters (letters, numbers, underscores only).");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      // Check username availability
      const { data: existing } = await supabase
        .from("User")
        .select("id")
        .eq("username", username.trim().toLowerCase())
        .maybeSingle();

      if (existing) {
        Alert.alert("Username taken", "That username is already in use. Try another.");
        return;
      }

      // Create Supabase auth account — store username/displayName in metadata
      // so the callback can create the User record after email confirmation
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: "gains://auth/callback",
          data: {
            username: username.trim().toLowerCase(),
            displayName: displayName.trim() || username.trim(),
          },
        },
      });

      if (authError || !authData.user) {
        Alert.alert("Sign up failed", authError?.message ?? "Unknown error.");
        return;
      }

      // If email confirmation is disabled, Supabase returns a session
      // immediately — go straight into the app.
      if (authData.session) {
        router.replace("/(tabs)");
        return;
      }

      // Otherwise show the "check your email" screen
      setEmailSent(true);
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.confirmContainer}>
          <Text style={styles.confirmIcon}>📬</Text>
          <Text style={styles.confirmTitle}>Check your email</Text>
          <Text style={styles.confirmSubtitle}>
            We sent a confirmation link to{"\n"}
            <Text style={styles.confirmEmail}>{email.trim().toLowerCase()}</Text>
          </Text>
          <Text style={styles.confirmInstructions}>
            Tap the link in the email to confirm your account. It will open the app and sign you in automatically.
          </Text>
          <Pressable style={styles.backToSignIn} onPress={() => router.back()}>
            <Text style={styles.backToSignInText}>Back to Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backIcon}>←</Text>
            </Pressable>
            <Text style={styles.logoText}>GAINS</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.formTitle}>Create account</Text>
            <Text style={styles.formSubtitle}>Join the community and start sharing your gains</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL</Text>
              <TextInput
                style={[styles.input, focusedField === "email" && styles.inputFocused]}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                placeholder="you@example.com"
                placeholderTextColor={Colors.grayDark}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor={Colors.gold}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>USERNAME</Text>
              <TextInput
                style={[styles.input, focusedField === "username" && styles.inputFocused]}
                value={username}
                onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                onFocus={() => setFocusedField("username")}
                onBlur={() => setFocusedField(null)}
                placeholder="your_handle"
                placeholderTextColor={Colors.grayDark}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
                selectionColor={Colors.gold}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>DISPLAY NAME (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, focusedField === "displayName" && styles.inputFocused]}
                value={displayName}
                onChangeText={setDisplayName}
                onFocus={() => setFocusedField("displayName")}
                onBlur={() => setFocusedField(null)}
                placeholder="Your Name"
                placeholderTextColor={Colors.grayDark}
                maxLength={50}
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
                  placeholder="Min. 6 characters"
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

            <Pressable
              style={[styles.signUpButton, loading && styles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.black} />
              ) : (
                <Text style={styles.signUpButtonText}>CREATE ACCOUNT</Text>
              )}
            </Pressable>

            <Pressable style={styles.signInLink} onPress={() => router.back()}>
              <Text style={styles.signInLinkText}>
                Already have an account?{" "}
                <Text style={styles.signInLinkAccent}>Sign in</Text>
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

  header: { flexDirection: "row", alignItems: "center", paddingTop: 16, paddingBottom: 32 },
  backButton: { padding: 8, marginRight: 12 },
  backIcon: { fontSize: 22, color: Colors.gold },
  logoText: { fontSize: 24, fontWeight: "800", color: Colors.gold, letterSpacing: 6 },

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

  signUpButton: {
    backgroundColor: Colors.gold, borderRadius: 16, paddingVertical: 18,
    alignItems: "center", marginTop: 8,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  signUpButtonText: { fontSize: 16, fontWeight: "800", color: Colors.black, letterSpacing: 1.5 },

  signInLink: { alignItems: "center", marginTop: 24 },
  signInLinkText: { fontSize: 15, color: Colors.gray },
  signInLinkAccent: { color: Colors.gold, fontWeight: "700" },

  // Email sent state
  confirmContainer: {
    flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32,
  },
  confirmIcon: { fontSize: 72, marginBottom: 24 },
  confirmTitle: { fontSize: 28, fontWeight: "800", color: Colors.white, marginBottom: 12, textAlign: "center" },
  confirmSubtitle: { fontSize: 16, color: Colors.gray, textAlign: "center", lineHeight: 24, marginBottom: 20 },
  confirmEmail: { color: Colors.gold, fontWeight: "700" },
  confirmInstructions: { fontSize: 14, color: Colors.grayDark, textAlign: "center", lineHeight: 22, marginBottom: 40 },
  backToSignIn: {
    backgroundColor: Colors.gold, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32,
  },
  backToSignInText: { fontSize: 15, fontWeight: "700", color: Colors.black },
});
