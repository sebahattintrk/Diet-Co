import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useUserStore } from '../store/userStore';

// ---------- types ----------
export type Goal = 'fat_loss' | 'muscle_gain' | 'recomp';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export type OnboardingPayload = {
  name?: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  weight_kg: number;
  height_cm: number;
  activity_level: Activity;
  goal: Goal;
  budget?: number;
  disliked_foods?: string[];
  starting_waist_cm?: number;
};

export type User = OnboardingPayload & {
  id: number;
  bmr: number;
  tdee: number;
  calorie_target: number;
  protein_target: number;
  carbs_target: number;
  fats_target: number;
  starting_waist_cm: number | string | null;
  is_premium: boolean;
};

export type Streak = {
  current: number;
  best: number;
  today_logged: boolean;
  next_milestone: number | null;
  days_to_next: number | null;
  just_hit_milestone: boolean;
  milestone_label: string | null;
};

export type InsightTone = 'positive' | 'neutral' | 'warning';

// Decision-card shape returned by /dashboard.insight.
// situation = ne durumdayız (headline)
// reason    = neden böyle (data-grounded)
// action    = bugün ne yap (single concrete step)
export type Insight = {
  tone: InsightTone;
  situation: string;
  reason: string;
  action: string;
  source?: 'gemini' | 'rule_engine';
};

export type DashboardData = {
  user: User;
  today: {
    calories_eaten: number;
    calories_target: number;
    protein_eaten: number;
    protein_target: number;
    water_ml: number;
    water_target_ml: number;
    compliance: number;
  };
  trend: Array<{
    log_date: string;
    weight_kg: number | null;
    waist_cm: number | null;
    water_ml: number;
    calories_eaten: number;
    protein_eaten: number;
    compliance: number;
  }>;
  insight: Insight;
  streak: Streak;
};

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type Meal = {
  slot: MealSlot;
  id: number;
  name: string;
  category: string;
  calories: number;
  protein_g: number | string;
  carbs_g: number | string;
  fats_g: number | string;
  description: string;
  image_url: string;
  tags: string[];
  done: boolean;
  // v2 — practical metadata. Older meals may not have these; render conditionally.
  serving_size_g?: number | string | null;
  prep_time_min?: number | null;
  ingredients?: string[];
  rationale?: string | null;
};

export type MealPlan = {
  date: string;
  targets: { calories: number; protein: number; carbs: number; fats: number };
  totals: { calories: number; protein: number; carbs: number; fats: number };
  meals: Meal[];
};

export type Supplement = {
  id: number;
  brand: string;
  product_name: string;
  category: string;
  protein_per_serving: number | string | null;
  serving_size_g: number | string | null;
  servings_per_pack: number | null;
  price: number | string;
  currency: string;
  quality_score: number | string;
  price_performance: number | string;
  image_url: string;
  tags: string[];
};

// Supplement detail returned by GET /supplements/:id.
// All score/rating/store/AI-summary derivation happens server-side now.
export type SupplementDetail = Supplement & {
  rating: number;
  rating_count: number;
  fake_review_risk: 'Düşük' | 'Orta' | 'Yüksek';
  ai_summary: string;
  score_breakdown: { label: string; value: number; explanation?: string }[];
  stores: { name: string; price: number }[];
};

// ---------- mutations ----------
export function useOnboarding() {
  return useMutation({
    mutationFn: async (payload: OnboardingPayload) => {
      const { data } = await api.post<User>('/onboarding', payload);
      return data;
    },
  });
}

export function useLogDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      user_id: number;
      weight_kg?: number;
      waist_cm?: number;
      water_ml?: number;
      // 0-100 self-rating ("Kötü/Orta/İyi" → 40/70/95). If omitted, backend derives
      // compliance from meal completion ratio + water + protein.
      compliance?: number;
    }) => {
      const { data } = await api.post('/daily-log', payload);
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['dashboard', vars.user_id] });
    },
  });
}

// ---------- queries ----------
export function useDashboard(userId: number | null) {
  return useQuery({
    queryKey: ['dashboard', userId],
    enabled: !!userId,
    queryFn: async () => (await api.get<DashboardData>(`/dashboard/${userId}`)).data,
  });
}

export function useMealPlan(userId: number | null) {
  return useQuery({
    queryKey: ['meal-plan', userId],
    enabled: !!userId,
    queryFn: async () => (await api.get<MealPlan>(`/api/meal-plan/${userId}`)).data,
  });
}

export function useRegeneratePlan(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<MealPlan>(`/api/meal-plan/${userId}/regenerate`);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(['meal-plan', userId], data);
    },
  });
}

export function useToggleMealDone(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { slot: MealSlot; done: boolean }) => {
      const { data } = await api.patch(`/api/meal-plan/${userId}/meal`, vars);
      return data as { slot: MealSlot; done: boolean };
    },
    // Optimistic: flip the local Meal.done immediately, rollback on error.
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['meal-plan', userId] });
      const prev = qc.getQueryData<MealPlan>(['meal-plan', userId]);
      if (prev) {
        qc.setQueryData<MealPlan>(['meal-plan', userId], {
          ...prev,
          meals: prev.meals.map((m) =>
            m.slot === vars.slot ? { ...m, done: vars.done } : m
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['meal-plan', userId], ctx.prev);
    },
    // Dashboard derives today's calories/protein from completed meal snapshots, so a
    // toggle invalidates it too — otherwise Home would show stale numbers.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', userId] });
    },
  });
}

// ---------- AI Chat ----------
export type ChatRole = 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };

export type ChatResponse = {
  reply: string;
  user?: User;
  loggedItem?: any;
};

export function useChat(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { message: string; history?: ChatMessage[] }) => {
      const { data } = await api.post<ChatResponse>(
        '/api/chat',
        {
          message: vars.message,
          history: vars.history,
          userId: userId || 1,
        }
      );
      return data;
    },
    onSuccess: (data) => {
      // Backend'den güncel user döndüğünde Profil ve Ana Sayfayı o salise güncelle
      if (data?.user) {
        useUserStore.getState().setUser(data.user);
        qc.invalidateQueries({ queryKey: ['dashboard'] });
        qc.invalidateQueries({ queryKey: ['meal-plan'] });
      }
    },
  });
}

// ---------- Progress photos (premium) ----------
export type ProgressPhoto = {
  id: number;
  photo_date: string;
  file_path: string;
  waist_cm: number | string | null;
  notes: string | null;
  created_at: string;
};

export function useProgressPhotos(userId: number | null) {
  return useQuery({
    queryKey: ['progress-photos', userId],
    enabled: !!userId,
    queryFn: async () =>
      (await api.get<ProgressPhoto[]>(`/progress-photos/${userId}`)).data,
  });
}

export function useUploadProgressPhoto(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      uri: string;
      waist_cm?: number;
      notes?: string;
    }) => {
      const form = new FormData();
      // RN's FormData expects {uri, name, type}; the cast keeps TS quiet without
      // pulling in extra typings.
      form.append('photo', {
        uri: vars.uri,
        name: 'photo.jpg',
        type: 'image/jpeg',
      } as unknown as Blob);
      if (vars.waist_cm != null) form.append('waist_cm', String(vars.waist_cm));
      if (vars.notes) form.append('notes', vars.notes);
      const { data } = await api.post<ProgressPhoto>(
        `/progress-photos/${userId}`,
        form,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          // axios shouldn't try to JSON-stringify FormData
          transformRequest: (d) => d as FormData,
          timeout: 30_000,
        },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['progress-photos', userId] });
      qc.invalidateQueries({ queryKey: ['progress-photo-analysis', userId] });
    },
  });
}

export function useDeleteProgressPhoto(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: number) => {
      await api.delete(`/progress-photos/${userId}/${photoId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['progress-photos', userId] });
      qc.invalidateQueries({ queryKey: ['progress-photo-analysis', userId] });
    },
  });
}

// Premium: AI vision analysis of the latest progress photo. Returns 402 from the server
// when the user isn't premium; the hook converts that into `enabled: false`-style
// data so callers can render a paywall card.
export type PhotoAnalysis = {
  analysis: string | null;
  photo_id: number | null;
  cached?: boolean;
  source?: string;
  reason?: string;
  // Server-side soft-failure indicators. When `status` is set, `analysis` is null
  // and the UI should render a friendly card instead of "loading".
  status?: 'rate_limited' | 'unavailable' | 'no_analysis_yet';
  message?: string;
};

export function usePhotoAnalysis(userId: number | null, isPremium: boolean, photoCount: number) {
  return useQuery({
    queryKey: ['progress-photo-analysis', userId, photoCount],
    // Only run for premium users with at least one photo.
    enabled: !!userId && isPremium && photoCount > 0,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data } = await api.get<PhotoAnalysis>(`/progress-photos/${userId}/analysis`);
      return data;
    },
  });
}

// ---------- Premium automations ----------
export type PlanAdjustmentReason =
  | 'insufficient_data'
  | 'low_adherence'
  | 'fat_loss_stalled'
  | 'fat_loss_too_fast'
  | 'recomp_signal'
  | 'muscle_gain_stall'
  | 'low_protein_intake'
  | 'on_track';

export type PlanAdjustment = {
  reason_code: PlanAdjustmentReason;
  reason_tr: string;
  action_tr: string;
  confidence: 'low' | 'medium' | 'high';
  current: { calorie_target: number; protein_target: number };
  suggested: { calorie_target: number; protein_target: number };
  calorie_delta: number;
  protein_delta: number;
  has_change: boolean;
};

export function usePlanAdjustment(userId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['plan-adjustment', userId],
    enabled: !!userId && enabled,
    staleTime: 60_000,
    queryFn: async () =>
      (await api.get<PlanAdjustment>(`/premium/plan-adjustment/${userId}`)).data,
  });
}

export function useApplyPlanAdjustment(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { calorie_target: number; protein_target: number }) => {
      const { data } = await api.post<{ ok: boolean; user: User }>(
        `/premium/plan-adjustment/${userId}/apply`,
        vars,
      );
      return data;
    },
    onSuccess: () => {
      // Targets changed → dashboard, plan, and the suggestion itself all need refresh.
      qc.invalidateQueries({ queryKey: ['dashboard', userId] });
      qc.invalidateQueries({ queryKey: ['meal-plan', userId] });
      qc.invalidateQueries({ queryKey: ['plan-adjustment', userId] });
      qc.invalidateQueries({ queryKey: ['weekly-report', userId] });
    },
  });
}

export type WeeklyReport = {
  week_ending: string;
  metrics: {
    days_logged: number;
    weight_delta_kg: number | null;
    weight_latest_kg: number | null;
    waist_delta_cm: number | null;
    waist_latest_cm: number | null;
    compliance_avg: number | null;
    protein_avg_g: number | null;
    protein_target_g: number;
    water_avg_ml: number | null;
    goal: string;
    calorie_target: number;
  };
  summary: {
    tone: 'positive' | 'neutral' | 'warning';
    body: string;
    action: string;
    source?: 'gemini' | 'rule_engine';
  };
};

export function useWeeklyReport(userId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['weekly-report', userId],
    enabled: !!userId && enabled,
    staleTime: 60 * 60_000, // weekly report — cache for an hour
    queryFn: async () =>
      (await api.get<WeeklyReport>(`/premium/weekly-report/${userId}`)).data,
  });
}

// ---------- Meal swap (premium) ----------
export type MealAlternative = {
  slot: MealSlot;
  category: string;
  name: string;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  tags: string[];
};

export type MealSwapResponse = {
  alternatives: MealAlternative[];
  source?: string;
  status?: 'rate_limited' | 'no_valid_alternatives';
  message?: string;
};

export function useSwapMeal(userId: number | null) {
  return useMutation({
    mutationFn: async (vars: { slot: MealSlot; reason?: string }) => {
      const { data } = await api.post<MealSwapResponse>(
        `/premium/meal-swap/${userId}/${vars.slot}`,
        { reason: vars.reason ?? null },
      );
      return data;
    },
  });
}

export function useApplyMealSwap(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { slot: MealSlot; meal: MealAlternative }) => {
      const { data } = await api.post<{ ok: boolean; slot: MealSlot; snapshot: MealAlternative }>(
        `/premium/meal-swap/${userId}/${vars.slot}/apply`,
        { meal: vars.meal },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meal-plan', userId] });
      qc.invalidateQueries({ queryKey: ['dashboard', userId] });
    },
  });
}

// ---------- Eating-out (premium) ----------
export type EatingOutVenue = 'doner' | 'kebap' | 'ev_yemegi' | 'market' | 'kahvalti' | 'fast_food';

export type EatingOutResponse = {
  venue?: EatingOutVenue;
  headline?: string;
  order_items?: string[];
  estimated_kcal?: number;
  estimated_protein_g?: number;
  advice?: string;
  avoid?: string | null;
  context?: { remaining_kcal: number; remaining_protein_g: number };
  status?: 'rate_limited';
  message?: string;
  error?: string;
};

export function useEatingOut(userId: number | null) {
  return useMutation({
    mutationFn: async (vars: { venue: EatingOutVenue }) => {
      const { data } = await api.post<EatingOutResponse>(
        `/premium/eating-out/${userId}`,
        { venue: vars.venue },
      );
      return data;
    },
  });
}

// ---------- Plan rationale (premium) ----------
export type PlanRationaleStep = {
  title: string;
  formula: string;
  value: string;
  explanation: string;
};
export type PlanRationale = {
  summary: string;
  steps: PlanRationaleStep[];
};
export function usePlanRationale(userId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['plan-rationale', userId],
    enabled: !!userId && enabled,
    staleTime: 60 * 60_000,
    queryFn: async () =>
      (await api.get<PlanRationale>(`/premium/plan-rationale/${userId}`)).data,
  });
}

// ---------- Goal simulation (premium) ----------
export type GoalSimulation =
  | {
    state: 'insufficient_data' | 'no_target' | 'reached' | 'wrong_direction';
    message?: string;
    samples_count?: number;
    current_weight_kg?: number;
    target_weight_kg?: number | null;
    velocity_per_week_kg?: number;
  }
  | {
    state: 'projecting';
    current_weight_kg: number;
    target_weight_kg: number;
    velocity_per_week_kg: number;
    remaining_kg: number;
    weeks_at_current_pace: number | null;
    eta_date: string | null;
    weeks_if_better: number | null;
    weeks_if_slower: number | null;
    samples_count: number;
    days_window: number;
    confidence: 'low' | 'medium' | 'high';
  };
export function useGoalSimulation(userId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['goal-simulation', userId],
    enabled: !!userId && enabled,
    queryFn: async () =>
      (await api.get<GoalSimulation>(`/premium/goal-simulation/${userId}`)).data,
  });
}
export function useSetTargetWeight(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { target_weight_kg: number }) => {
      const { data } = await api.post<{ ok: boolean; target_weight_kg: number }>(
        `/premium/goal-simulation/${userId}/target`,
        vars,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goal-simulation', userId] });
    },
  });
}

// ---------- Crisis mode (premium) ----------
export type CrisisKind = 'ate_out' | 'cheat_meal' | 'late_hungry' | 'protein_low' | 'skipped_meal' | 'post_workout';
export type CrisisResponse = {
  kind: CrisisKind;
  title: string;
  advice: string;
  action: string;
  suggested_food: string | null;
  source: 'gemini' | 'rule_engine';
  context: { remaining_kcal: number; remaining_protein_g: number };
};
export function useCrisisMode(userId: number | null) {
  return useMutation({
    mutationFn: async (vars: { kind: CrisisKind }) => {
      const { data } = await api.post<CrisisResponse>(`/premium/crisis/${userId}`, vars);
      return data;
    },
  });
}

// ---------- Exercise library (ExerciseDB) ----------
export type Exercise = {
  id: string;
  name: string;
  gifUrl: string;
  bodyParts: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  equipments: string[];
  instructions: string[];
};

export type ExerciseFilters = {
  q?: string;
  bodyPart?: string;
  muscle?: string;
  equipment?: string;
  limit?: number;
};

export function useExercises(filters: ExerciseFilters) {
  return useQuery({
    queryKey: ['exercises', filters],
    staleTime: 10 * 60_000,
    queryFn: async () =>
      (await api.get<Exercise[]>('/exercises', { params: filters })).data,
  });
}

export function useExerciseDetail(id: string | null) {
  return useQuery({
    queryKey: ['exercise', id],
    enabled: !!id,
    staleTime: 60 * 60_000,
    queryFn: async () =>
      (await api.get<Exercise>(`/exercises/${id}`)).data,
  });
}

// ---------- Smart Exercise Recommendation ----------
export type ExerciseRecommendationContext = {
  goal: string;
  waist_trend_cm: number | null;
  weight_trend_kg: number | null;
  compliance_avg: number | null;
  protein_today_ratio: number | null;
  calories_today_ratio: number | null;
  water_today_ml: number;
  meals_done: number;
  samples_count: number;
};

export type ExerciseRecommendationBlock = {
  tone: 'positive' | 'neutral' | 'warning';
  title: string;
  reason: string;
  session_type: 'low_intensity' | 'strength' | 'core' | 'mobility' | 'recovery';
  duration_min: number;
  intensity: 'low' | 'medium' | 'high';
  timing: string;
  exercises: Exercise[];
};

export type ExerciseRecommendation = {
  context: ExerciseRecommendationContext;
  recommendation: ExerciseRecommendationBlock;
};

export function useExerciseRecommendation(userId: number | null) {
  return useQuery({
    queryKey: ['exercise-recommendation', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (await api.get<ExerciseRecommendation>(`/exercises/recommendations/${userId}`)).data,
  });
}

// ---------- Meal photo estimation (premium) ----------
export type MealPhotoEstimate = {
  label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  confidence: 'low' | 'medium' | 'high';
  notes: string;
};
export type MealPhotoRow = {
  id: number;
  user_id: number;
  photo_date: string;
  file_path: string;
  ai_label: string | null;
  estimated_kcal: number | null;
  estimated_protein_g: number | string | null;
  estimated_carbs_g: number | string | null;
  estimated_fats_g: number | string | null;
  ai_notes: string | null;
  user_label: string | null;
  user_kcal: number | null;
  user_protein_g: number | string | null;
  created_at: string;
};
export type MealPhotoUploadResponse = {
  row: MealPhotoRow;
  estimate: MealPhotoEstimate | null;
  source: string;
  confidence: 'low' | 'medium' | 'high' | null;
  status: 'ok' | 'rate_limited' | 'ai_offline' | 'ai_error';
};

export function useMealPhotos(userId: number | null) {
  return useQuery({
    queryKey: ['meal-photos', userId],
    enabled: !!userId,
    queryFn: async () =>
      (await api.get<MealPhotoRow[]>(`/premium/meal-photo/${userId}`)).data,
  });
}

export function useUploadMealPhoto(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { uri: string }) => {
      const form = new FormData();
      form.append('photo', {
        uri: vars.uri,
        name: 'meal.jpg',
        type: 'image/jpeg',
      } as unknown as Blob);
      const { data } = await api.post<MealPhotoUploadResponse>(
        `/premium/meal-photo/${userId}`,
        form,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          transformRequest: (d) => d as FormData,
          timeout: 30_000,
        },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meal-photos', userId] });
    },
  });
}

export function useCorrectMealPhoto(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: number;
      user_label?: string;
      user_kcal?: number;
      user_protein_g?: number;
    }) => {
      const { id, ...body } = vars;
      const { data } = await api.patch<MealPhotoRow>(`/premium/meal-photo/${userId}/${id}`, body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meal-photos', userId] });
    },
  });
}

export function useDeleteMealPhoto(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/premium/meal-photo/${userId}/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meal-photos', userId] });
    },
  });
}

// ---------- Smart notifications ----------
export type ScheduledNotification = {
  hour: number;
  minute: number;
  tag: string;
  title: string;
  body: string;
};
export type NotificationSchedule = {
  date: string;
  items: ScheduledNotification[];
};
export async function fetchNotificationSchedule(userId: number): Promise<NotificationSchedule> {
  const { data } = await api.get<NotificationSchedule>(`/notifications/schedule/${userId}`);
  return data;
}
