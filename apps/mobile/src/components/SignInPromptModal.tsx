import { View, Text, Modal, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Colors from "../constants/colors";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function SignInPromptModal({ visible, onClose }: Props) {
  const router = useRouter();

  const goSignIn = () => { onClose(); router.push("/(auth)/sign-in"); };
  const goSignUp = () => { onClose(); router.push("/(auth)/sign-up"); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.lion}>🦁</Text>
          <Text style={styles.title}>Join Gains</Text>
          <Text style={styles.subtitle}>
            Sign in to see your profile, notifications, and connect with the community.
          </Text>
          <Pressable style={styles.signInButton} onPress={goSignIn}>
            <Text style={styles.signInText}>Sign In</Text>
          </Pressable>
          <Pressable style={styles.signUpButton} onPress={goSignUp}>
            <Text style={styles.signUpText}>Create Account</Text>
          </Pressable>
          <Pressable style={styles.skipButton} onPress={onClose}>
            <Text style={styles.skipText}>Maybe later</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.dark800,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 16,
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: Colors.dark700,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark600,
    marginBottom: 24,
  },
  lion: { fontSize: 56, marginBottom: 16 },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.white,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.gray,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  signInButton: {
    width: "100%",
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  signInText: { fontSize: 16, fontWeight: "800", color: Colors.black, letterSpacing: 1 },
  signUpButton: {
    width: "100%",
    backgroundColor: "transparent",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.dark600,
  },
  signUpText: { fontSize: 16, fontWeight: "600", color: Colors.white },
  skipButton: { paddingVertical: 12 },
  skipText: { fontSize: 14, color: Colors.grayDark },
});
