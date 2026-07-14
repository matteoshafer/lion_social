import { useState } from "react";
import {
  View, Text, TextInput, Pressable, Image, ScrollView,
  Alert, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import Colors, { PostTypeColors, PostTypeLabels } from "../../src/constants/colors";
import { supabase } from "../../src/lib/supabase";

const ALL_EXERCISES = [
  "Arnold Press","Back Squat","Barbell Curl","Barbell Row","Battle Ropes","Bench Press",
  "Box Jump","Bulgarian Split Squat","Cable Crunch","Cable Crossover","Cable Curl",
  "Cable Flyes","Cable Row","Calf Raises","Chest Dips","Chest Fly","Chin-ups",
  "Clean and Jerk","Cycling","Dead Bug","Deadlift","Decline Bench Press","Dips",
  "Dumbbell Curl","Dumbbell Fly","Dumbbell Row","Dumbbell Shrug","Elliptical",
  "Face Pulls","Front Raises","Front Squat","Goblet Squat","Good Mornings",
  "Hack Squat","Hammer Curl","Hanging Leg Raise","Hip Thrust","Incline Bench Press",
  "Incline Dumbbell Press","Jump Rope","Kettlebell Swing","Lat Pulldown","Lateral Raises",
  "Leg Curl","Leg Extension","Leg Press","Leg Raises","Lunge","Machine Row",
  "Meadows Row","Military Press","Mountain Climbers","Overhead Press","Overhead Tricep Extension",
  "Pec Deck","Plank","Preacher Curl","Pull-ups","Push-ups","Rear Delt Flyes",
  "Reverse Curl","Reverse Flyes","Romanian Deadlift","Rowing Machine","Running",
  "Russian Twist","Seated Cable Row","Seated Dumbbell Press","Skull Crushers","Snatch",
  "Squats","Stair Climber","Step-ups","Sumo Deadlift","Swimming","T-Bar Row",
  "Tricep Dips","Tricep Kickback","Tricep Pushdowns","Upright Row","Walking Lunges",
  "Weighted Dips","Weighted Pull-ups","Wide Grip Pull-ups","Zercher Squat",
];

const ALL_INGREDIENTS = [
  "Almond Butter","Almonds","Asparagus","Avocado","Bacon","Baked Potato","Banana",
  "Bell Pepper","Black Beans","Blueberries","Broccoli","Brown Rice","Brussels Sprouts",
  "Butter","Cashews","Cauliflower","Cheddar Cheese","Chia Seeds","Chicken Breast",
  "Chicken Thighs","Chickpeas","Coconut Oil","Cod","Cottage Cheese","Cucumber",
  "Edamame","Egg Whites","Eggs","Feta Cheese","Flaxseed","Garlic","Greek Yogurt",
  "Green Beans","Ground Beef","Ground Turkey","Hemp Seeds","Honey","Hummus",
  "Kale","Kidney Beans","Lean Beef","Lemon","Lentils","Mozzarella","Oat Milk",
  "Oatmeal","Olive Oil","Onion","Orange","Parmesan","Pasta","Peanut Butter",
  "Peanuts","Pinto Beans","Protein Powder","Pumpkin Seeds","Quinoa","Raspberry",
  "Salmon","Shrimp","Skim Milk","Soy Milk","Spinach","Steak","Strawberries",
  "String Cheese","Sweet Potato","Tilapia","Tofu","Tuna","Turkey Breast",
  "Walnuts","Whey Protein","White Rice","Whole Milk","Whole Wheat Bread",
  "Whole Wheat Pasta","Wild Rice","Zucchini",
];

function AutoSuggest({ query, suggestions, onSelect }: { query: string; suggestions: string[]; onSelect: (s: string) => void }) {
  if (!query.trim() || query.trim().length < 2) return null;
  const filtered = suggestions
    .filter((s) => s.toLowerCase().startsWith(query.toLowerCase()))
    .slice(0, 5);
  if (!filtered.length) return null;
  return (
    <View style={suggestStyles.container}>
      {filtered.map((item) => (
        <Pressable key={item} style={suggestStyles.item} onPress={() => onSelect(item)}>
          <Text style={suggestStyles.text}>{item}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const suggestStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark700, borderRadius: 10, marginTop: -6,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.dark600, overflow: "hidden",
  },
  item: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.dark600 },
  text: { fontSize: 14, color: Colors.white },
});

type PostType = "workout" | "meal" | "quote" | "story";

const POST_TYPE_ICONS: Record<PostType, string> = {
  workout: "💪", meal: "🥗", quote: "💬", story: "📖",
};
const POST_TYPE_DESCRIPTIONS: Record<PostType, string> = {
  workout: "Log your training session",
  meal: "Track your nutrition",
  quote: "Inspire the community",
  story: "Document your journey",
};

const WORKOUT_TEMPLATES: { label: string; exercises: string[] }[] = [
  { label: "Leg Day", exercises: ["Squats", "Leg Press", "Romanian Deadlift", "Leg Curls", "Calf Raises"] },
  { label: "Push Day", exercises: ["Bench Press", "Overhead Press", "Incline Press", "Lateral Raises", "Tricep Pushdowns"] },
  { label: "Pull Day", exercises: ["Deadlift", "Pull-ups", "Barbell Row", "Lat Pulldown", "Bicep Curls"] },
  { label: "Chest Day", exercises: ["Bench Press", "Incline Dumbbell Press", "Cable Flyes", "Dips"] },
  { label: "Back Day", exercises: ["Deadlift", "Pull-ups", "Seated Cable Row", "Lat Pulldown", "Face Pulls"] },
  { label: "Shoulder Day", exercises: ["Overhead Press", "Lateral Raises", "Front Raises", "Rear Delt Flyes", "Shrugs"] },
  { label: "Arm Day", exercises: ["Barbell Curl", "Skull Crushers", "Hammer Curls", "Tricep Dips", "Cable Curls"] },
  { label: "Full Body", exercises: ["Squats", "Bench Press", "Deadlift", "Pull-ups", "Overhead Press"] },
  { label: "Cardio", exercises: ["Running", "Cycling", "Jump Rope", "Rowing"] },
  { label: "Custom", exercises: [] },
];

interface Exercise { name: string; sets: string; reps: string; }
interface Macro { calories: string; protein: string; carbs: string; fat: string; }

async function uploadImage(uri: string, userId: string): Promise<string | null> {
  try {
    const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
    const filename = `${userId}/${Date.now()}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();
    const { error } = await supabase.storage.from("posts").upload(filename, arrayBuffer, { contentType: `image/${ext}`, upsert: false });
    if (error) return null;
    const { data } = supabase.storage.from("posts").getPublicUrl(filename);
    return data.publicUrl;
  } catch { return null; }
}

function buildWorkoutCaption(template: string, exercises: Exercise[], notes: string): string {
  const lines: string[] = [];
  if (template) lines.push(`🏋️ ${template}\n`);
  exercises.forEach((ex) => {
    if (ex.name.trim()) {
      const detail = ex.sets && ex.reps ? ` — ${ex.sets} sets × ${ex.reps} reps` : ex.sets ? ` — ${ex.sets} sets` : ex.reps ? ` — ${ex.reps} reps` : "";
      lines.push(`• ${ex.name.trim()}${detail}`);
    }
  });
  if (notes.trim()) lines.push(`\n${notes.trim()}`);
  return lines.join("\n");
}

function buildMealCaption(mealName: string, ingredients: string[], macro: Macro, notes: string): string {
  const lines: string[] = [];
  if (mealName.trim()) lines.push(`🍽️ ${mealName.trim()}\n`);
  const validIngredients = ingredients.filter((i) => i.trim());
  if (validIngredients.length) {
    lines.push("Ingredients:");
    validIngredients.forEach((i) => lines.push(`• ${i.trim()}`));
  }
  const macroParts = [];
  if (macro.calories) macroParts.push(`${macro.calories} cal`);
  if (macro.protein) macroParts.push(`${macro.protein}g protein`);
  if (macro.carbs) macroParts.push(`${macro.carbs}g carbs`);
  if (macro.fat) macroParts.push(`${macro.fat}g fat`);
  if (macroParts.length) lines.push(`\nMacros: ${macroParts.join(" | ")}`);
  if (notes.trim()) lines.push(`\n${notes.trim()}`);
  return lines.join("\n");
}

export default function CreateScreen() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<PostType | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Workout state
  const [workoutTemplate, setWorkoutTemplate] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([{ name: "", sets: "", reps: "" }]);
  const [workoutNotes, setWorkoutNotes] = useState("");
  const [focusedExercise, setFocusedExercise] = useState<number | null>(null);
  const [focusedIngredient, setFocusedIngredient] = useState<number | null>(null);

  // Meal state
  const [mealName, setMealName] = useState("");
  const [ingredients, setIngredients] = useState<string[]>(["", ""]);
  const [macro, setMacro] = useState<Macro>({ calories: "", protein: "", carbs: "", fat: "" });
  const [mealNotes, setMealNotes] = useState("");

  // Quote / Journal state
  const [caption, setCaption] = useState("");

  const selectTemplate = (template: { label: string; exercises: string[] }) => {
    setWorkoutTemplate(template.label);
    if (template.exercises.length) {
      setExercises(template.exercises.map((name) => ({ name, sets: "", reps: "" })));
    } else {
      setExercises([{ name: "", sets: "", reps: "" }]);
    }
  };

  const updateExercise = (index: number, field: keyof Exercise, value: string) => {
    setExercises((prev) => prev.map((ex, i) => i === index ? { ...ex, [field]: value } : ex));
  };
  const addExercise = () => setExercises((prev) => [...prev, { name: "", sets: "", reps: "" }]);
  const removeExercise = (index: number) => setExercises((prev) => prev.filter((_, i) => i !== index));

  const updateIngredient = (index: number, value: string) => {
    setIngredients((prev) => prev.map((ing, i) => i === index ? value : ing));
  };
  const addIngredient = () => setIngredients((prev) => [...prev, ""]);
  const removeIngredient = (index: number) => setIngredients((prev) => prev.filter((_, i) => i !== index));

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission needed", "Please allow access to your photo library."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const getFinalCaption = (): string => {
    if (selectedType === "workout") return buildWorkoutCaption(workoutTemplate, exercises, workoutNotes);
    if (selectedType === "meal") return buildMealCaption(mealName, ingredients, macro, mealNotes);
    return caption.trim();
  };

  const isValid = (): boolean => {
    return selectedType !== null;
  };

  const handleSubmit = async () => {
    if (!isValid()) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { Alert.alert("Not logged in", "Please sign in to post."); return; }
      const { data: appUser } = await supabase.from("User").select("id").eq("supabaseId", session.user.id).single();
      if (!appUser) { Alert.alert("Error", "Could not find your account."); return; }

      let imageUrl: string | null = null;
      if (imageUri) imageUrl = await uploadImage(imageUri, (appUser as any).id);

      const now = new Date().toISOString();
      const postId = "c" + Math.random().toString(36).substring(2, 26);
      const { error } = await supabase.from("Post").insert({
        id: postId,
        userId: (appUser as any).id,
        type: selectedType,
        caption: getFinalCaption(),
        imageUrl,
        createdAt: now,
        updatedAt: now,
      });

      if (error) { Alert.alert("Error", error.message); return; }

      // Reset form and navigate straight to the feed — no alert needed
      setSelectedType(null); setImageUri(null); setCaption("");
      setWorkoutTemplate(""); setExercises([{ name: "", sets: "", reps: "" }]); setWorkoutNotes("");
      setMealName(""); setIngredients(["", ""]); setMacro({ calories: "", protein: "", carbs: "", fat: "" }); setMealNotes("");
      router.replace("/(tabs)");
    } catch { Alert.alert("Error", "Something went wrong. Please try again."); }
    finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Create Post</Text>
            <Text style={styles.headerSubtitle}>Share your journey with the community</Text>
          </View>

          {/* Post Type Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>POST TYPE</Text>
            <View style={styles.typeGrid}>
              {(Object.keys(POST_TYPE_ICONS) as PostType[]).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setSelectedType(type)}
                  style={[styles.typeCard, selectedType === type && styles.typeCardActive, selectedType === type && { borderColor: PostTypeColors[type], backgroundColor: `${PostTypeColors[type]}15` }]}
                >
                  <Text style={styles.typeIcon}>{POST_TYPE_ICONS[type]}</Text>
                  <Text style={[styles.typeLabel, selectedType === type && { color: PostTypeColors[type] }]}>{PostTypeLabels[type]}</Text>
                  <Text style={styles.typeDescription}>{POST_TYPE_DESCRIPTIONS[type]}</Text>
                  {selectedType === type && (
                    <View style={[styles.typeCheckmark, { backgroundColor: PostTypeColors[type] }]}>
                      <Text style={styles.typeCheckmarkText}>✓</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>

          {/* WORKOUT BUILDER */}
          {selectedType === "workout" && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>WORKOUT TYPE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateRow}>
                  {WORKOUT_TEMPLATES.map((t) => (
                    <Pressable
                      key={t.label}
                      onPress={() => selectTemplate(t)}
                      style={[styles.templatePill, workoutTemplate === t.label && styles.templatePillActive]}
                    >
                      <Text style={[styles.templatePillText, workoutTemplate === t.label && styles.templatePillTextActive]}>{t.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>EXERCISES</Text>
                {exercises.map((ex, index) => (
                  <View key={index} style={styles.exerciseWrapper}>
                    <View style={styles.exerciseRow}>
                      <TextInput
                        style={[styles.input, styles.exerciseName]}
                        placeholder="Exercise name"
                        placeholderTextColor={Colors.grayDark}
                        value={ex.name}
                        onChangeText={(v) => updateExercise(index, "name", v)}
                        onFocus={() => setFocusedExercise(index)}
                        onBlur={() => setTimeout(() => setFocusedExercise(null), 150)}
                        selectionColor={Colors.gold}
                      />
                      <TextInput
                        style={[styles.input, styles.exerciseSmall]}
                        placeholder="Sets"
                        placeholderTextColor={Colors.grayDark}
                        value={ex.sets}
                        onChangeText={(v) => updateExercise(index, "sets", v)}
                        keyboardType="numeric"
                        selectionColor={Colors.gold}
                      />
                      <TextInput
                        style={[styles.input, styles.exerciseSmall]}
                        placeholder="Reps"
                        placeholderTextColor={Colors.grayDark}
                        value={ex.reps}
                        onChangeText={(v) => updateExercise(index, "reps", v)}
                        keyboardType="numeric"
                        selectionColor={Colors.gold}
                      />
                      {exercises.length > 1 && (
                        <Pressable onPress={() => removeExercise(index)} style={styles.removeBtn}>
                          <Text style={styles.removeBtnText}>✕</Text>
                        </Pressable>
                      )}
                    </View>
                    {focusedExercise === index && (
                      <AutoSuggest
                        query={ex.name}
                        suggestions={ALL_EXERCISES}
                        onSelect={(s) => { updateExercise(index, "name", s); setFocusedExercise(null); }}
                      />
                    )}
                  </View>
                ))}
                <Pressable onPress={addExercise} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>+ Add Exercise</Text>
                </Pressable>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>NOTES (OPTIONAL)</Text>
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  placeholder="How did it go? PRs, feelings, observations..."
                  placeholderTextColor={Colors.grayDark}
                  value={workoutNotes}
                  onChangeText={setWorkoutNotes}
                  multiline
                  selectionColor={Colors.gold}
                />
              </View>
            </>
          )}

          {/* MEAL BUILDER */}
          {selectedType === "meal" && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>MEAL NAME</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Post-workout chicken bowl"
                  placeholderTextColor={Colors.grayDark}
                  value={mealName}
                  onChangeText={setMealName}
                  selectionColor={Colors.gold}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>INGREDIENTS</Text>
                {ingredients.map((ing, index) => (
                  <View key={index} style={styles.exerciseWrapper}>
                    <View style={styles.ingredientRow}>
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        placeholder={`Ingredient ${index + 1}`}
                        placeholderTextColor={Colors.grayDark}
                        value={ing}
                        onChangeText={(v) => updateIngredient(index, v)}
                        onFocus={() => setFocusedIngredient(index)}
                        onBlur={() => setTimeout(() => setFocusedIngredient(null), 150)}
                        selectionColor={Colors.gold}
                      />
                      {ingredients.length > 1 && (
                        <Pressable onPress={() => removeIngredient(index)} style={styles.removeBtn}>
                          <Text style={styles.removeBtnText}>✕</Text>
                        </Pressable>
                      )}
                    </View>
                    {focusedIngredient === index && (
                      <AutoSuggest
                        query={ing}
                        suggestions={ALL_INGREDIENTS}
                        onSelect={(s) => { updateIngredient(index, s); setFocusedIngredient(null); }}
                      />
                    )}
                  </View>
                ))}
                <Pressable onPress={addIngredient} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>+ Add Ingredient</Text>
                </Pressable>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>MACROS (OPTIONAL)</Text>
                <View style={styles.macroGrid}>
                  {[
                    { key: "calories", label: "Calories", unit: "kcal" },
                    { key: "protein", label: "Protein", unit: "g" },
                    { key: "carbs", label: "Carbs", unit: "g" },
                    { key: "fat", label: "Fat", unit: "g" },
                  ].map(({ key, label, unit }) => (
                    <View key={key} style={styles.macroItem}>
                      <Text style={styles.macroLabel}>{label}</Text>
                      <TextInput
                        style={styles.macroInput}
                        placeholder="0"
                        placeholderTextColor={Colors.grayDark}
                        value={macro[key as keyof Macro]}
                        onChangeText={(v) => setMacro((prev) => ({ ...prev, [key]: v }))}
                        keyboardType="numeric"
                        selectionColor={Colors.gold}
                      />
                      <Text style={styles.macroUnit}>{unit}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>NOTES (OPTIONAL)</Text>
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  placeholder="Prep tips, taste, how you felt..."
                  placeholderTextColor={Colors.grayDark}
                  value={mealNotes}
                  onChangeText={setMealNotes}
                  multiline
                  selectionColor={Colors.gold}
                />
              </View>
            </>
          )}

          {/* QUOTE / JOURNAL */}
          {(selectedType === "quote" || selectedType === "story") && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {selectedType === "quote" ? "YOUR QUOTE" : "YOUR ENTRY"}
              </Text>
              <View style={styles.captionContainer}>
                <TextInput
                  style={styles.captionInput}
                  placeholder={selectedType === "quote" ? "Share words that inspire you..." : "Tell your story, your journey, your why..."}
                  placeholderTextColor={Colors.grayDark}
                  value={caption}
                  onChangeText={setCaption}
                  multiline
                  maxLength={500}
                  textAlignVertical="top"
                  selectionColor={Colors.gold}
                />
                <Text style={styles.charCount}>{caption.length}/500</Text>
              </View>
            </View>
          )}

          {/* Photo — shown for all types */}
          {selectedType && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PHOTO (OPTIONAL)</Text>
              <Pressable onPress={handlePickImage} style={styles.imagePicker}>
                {imageUri ? (
                  <>
                    <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
                    <Pressable style={styles.removeImage} onPress={() => setImageUri(null)}>
                      <Text style={styles.removeImageText}>✕</Text>
                    </Pressable>
                  </>
                ) : (
                  <View style={styles.imagePickerContent}>
                    <Text style={styles.imagePickerIcon}>📷</Text>
                    <Text style={styles.imagePickerText}>Tap to add a photo</Text>
                  </View>
                )}
              </Pressable>
            </View>
          )}

          {/* Submit */}
          {selectedType && (
            <View style={styles.submitContainer}>
              <Pressable
                onPress={handleSubmit}
                style={[styles.submitButton, (!isValid() || submitting) && styles.submitButtonDisabled]}
                disabled={!isValid() || submitting}
              >
                {submitting ? <ActivityIndicator color={Colors.black} /> : (
                  <Text style={[styles.submitButtonText, !isValid() && styles.submitButtonTextDisabled]}>Share Your Gains</Text>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  scrollContent: { paddingBottom: 120 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: Colors.white, letterSpacing: 0.5, marginBottom: 4 },
  headerSubtitle: { fontSize: 15, color: Colors.gray },
  section: { paddingHorizontal: 20, marginBottom: 28 },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: Colors.gold, letterSpacing: 1.5, marginBottom: 12 },

  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  typeCard: { width: "47%", backgroundColor: Colors.dark800, borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: Colors.dark700, position: "relative", overflow: "hidden" },
  typeCardActive: { borderWidth: 2 },
  typeIcon: { fontSize: 32, marginBottom: 8 },
  typeLabel: { fontSize: 16, fontWeight: "700", color: Colors.white, marginBottom: 4 },
  typeDescription: { fontSize: 12, color: Colors.gray, lineHeight: 17 },
  typeCheckmark: { position: "absolute", top: 12, right: 12, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  typeCheckmarkText: { fontSize: 14, fontWeight: "700", color: Colors.white },

  templateRow: { gap: 8, paddingVertical: 4 },
  templatePill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.dark800, borderWidth: 1, borderColor: Colors.dark700 },
  templatePillActive: { backgroundColor: Colors.goldMuted, borderColor: Colors.gold },
  templatePillText: { fontSize: 14, fontWeight: "600", color: Colors.gray },
  templatePillTextActive: { color: Colors.gold },

  input: { backgroundColor: Colors.dark800, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: Colors.white, borderWidth: 1, borderColor: Colors.dark700, marginBottom: 10 },
  exerciseWrapper: { marginBottom: 8 },
  exerciseRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  exerciseName: { flex: 1, marginBottom: 0, flexShrink: 1 },
  exerciseSmall: { width: 60, marginBottom: 0, textAlign: "center" },
  removeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.dark700, alignItems: "center", justifyContent: "center" },
  removeBtnText: { fontSize: 13, color: Colors.gray, fontWeight: "700" },
  addBtn: { marginTop: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.dark700, borderStyle: "dashed", alignItems: "center" },
  addBtnText: { fontSize: 14, fontWeight: "600", color: Colors.gold },
  notesInput: { minHeight: 80, textAlignVertical: "top", marginBottom: 0 },

  ingredientRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },

  macroGrid: { flexDirection: "row", gap: 10 },
  macroItem: { flex: 1, backgroundColor: Colors.dark800, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.dark700, alignItems: "center" },
  macroLabel: { fontSize: 10, fontWeight: "700", color: Colors.gold, letterSpacing: 1, marginBottom: 8 },
  macroInput: { fontSize: 20, fontWeight: "700", color: Colors.white, textAlign: "center", width: "100%" },
  macroUnit: { fontSize: 11, color: Colors.gray, marginTop: 4 },

  captionContainer: { backgroundColor: Colors.dark800, borderRadius: 16, borderWidth: 1, borderColor: Colors.dark700, overflow: "hidden" },
  captionInput: { padding: 16, fontSize: 15, color: Colors.white, lineHeight: 22, minHeight: 140 },
  charCount: { fontSize: 12, color: Colors.grayDark, textAlign: "right", paddingHorizontal: 16, paddingBottom: 12 },

  imagePicker: { height: 160, backgroundColor: Colors.dark800, borderRadius: 16, borderWidth: 2, borderColor: Colors.dark700, borderStyle: "dashed", overflow: "hidden" },
  imagePickerContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  imagePickerIcon: { fontSize: 36, opacity: 0.7 },
  imagePickerText: { fontSize: 15, fontWeight: "600", color: Colors.grayLight },
  imagePreview: { width: "100%", height: "100%" },
  removeImage: { position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  removeImageText: { fontSize: 14, color: Colors.white, fontWeight: "700" },

  submitContainer: { paddingHorizontal: 20, paddingTop: 8 },
  submitButton: { backgroundColor: Colors.gold, borderRadius: 16, paddingVertical: 18, alignItems: "center", justifyContent: "center", shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  submitButtonDisabled: { backgroundColor: Colors.dark700, shadowOpacity: 0, elevation: 0 },
  submitButtonText: { fontSize: 16, fontWeight: "800", color: Colors.black, letterSpacing: 1, textTransform: "uppercase" },
  submitButtonTextDisabled: { color: Colors.grayDark },
});
