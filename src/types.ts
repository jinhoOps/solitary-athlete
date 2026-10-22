export interface WorkoutLog {
  user_id: string; username: string; log_date: string; memo: string;
  has_photo: boolean; verification_count: number;
}
export interface Member {
  id: string; name: string; dates: Set<string>; photos: Set<string>;
}
export interface PublicConfig { url: string; key: string }
export interface MonthlyKPIs {
  workoutKings: {id:string;name:string;days:number;title:string}[];
  activeMembers: number;
  totalWorkoutDays: number;
  mostActiveWeekday: string;
  mostActiveWeekdayDays: number;
  averageDaysPerMember: number;
}
export interface GrassParticipationSample {
  collectedAt: string; members: number; days: number; elapsedDays: number;
}
export type GrassParticipation =
  | { status: 'ready'; month: string; current: GrassParticipationSample; previous: GrassParticipationSample | null }
  | { status: 'pending' | 'unavailable' };
export interface DashboardData {
  roster: {id:string;name:string}[];
  members: Member[];
  logs: WorkoutLog[];
  lastSuccess: string | null;
  kpis: MonthlyKPIs;
  grassParticipation: GrassParticipation;
  currentStats?: Map<string, {week:number;streak:number;total:number}>;
}
