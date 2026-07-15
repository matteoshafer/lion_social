import { useState } from "react";
import {
  View, Text, TextInput, Pressable, KeyboardAvoidingView,
  ScrollView, ActivityIndicator, Alert, Platform, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "../../src/constants/colors";
import { supabase } from "../../src/lib/supabase";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSendResetLink = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      Alert.alert("Missing email", "Please enter the email for your account.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: "gains://reset-password",
    });
    setLoading(false);
    if (error) {
      Alert.alert("Something went wrong", error.message);
      return;
    }
    setSent(true);
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
            <Text style={styles.formTitle}>Forgot Password</Text>
            <Text style={styles.formSubtitle}>
              Enter your email and we'll send you a reset link
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.grayDark}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor={Colors.gold}
              />
            </View>

            <Pressable
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleSendResetLink}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.black} />
              ) : (
                <Text style={styles.primaryButtonText}>SEND RESET LINK</Text>
              )}
            </Pressable>

            {sent && (
              <Text style={styles.sentText}>Check your email for a reset link</Text>
            )}

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable style={styles.backLink} onPress={() => router.back()}>
              <Text style={styles.backLinkText}>
                Remembered it?{" "}
                <Text style={styles.backLinkAccent}>Back to Sign In</Text>
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

  primaryButton: {
    backgroundColor: Colors.gold, borderRadius: 16, paddingVertical: 18,
    alignItems: "center", marginTop: 8,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { fontSize: 16, fontWeight: "800", color: Colors.black, letterSpacing: 1.5 },

  sentText: { fontSize: 14, color: Colors.success, textAlign: "center", marginTop: 16 },

  divider: { flexDirection: "row", alignItems: "center", marginVertical: 24, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.dark700 },
  dividerText: { fontSize: 13, color: Colors.grayDark },

  backLink: { alignItems: "center" },
  backLinkText: { fontSize: 15, color: Colors.gray },
  backLinkAccent: { color: Colors.gold, fontWeight: "700" },
});
