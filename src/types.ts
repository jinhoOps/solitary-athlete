export interface WorkoutLog {
  user_id: string; username: string; log_date: string; memo: string;
  has_photo: boolean; verification_count: number;
}
export type WorkoutSubject={kind:'discord'|'person';id:string};
export interface ViewWorkoutLog extends Omit<WorkoutLog,'user_id'> {subject:WorkoutSubject}
export interface PersonWorkoutDTO extends Omit<WorkoutLog,'user_id'> {person_id:string;identity_revision:number}
export type WorkoutEntry=WorkoutLog|ViewWorkoutLog;
export interface RosterMember {subject:WorkoutSubject;name:string}
export interface Member {
  subject: WorkoutSubject; name: string; dates: Set<string>; photos: Set<string>;
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
  identityRevision?:number;calculationVersion?:number;
  collectedAt: string; members: number; days: number; elapsedDays: number;
}
export type GrassParticipation =
  | { status: 'ready'; month: string; current: GrassParticipationSample; previous: GrassParticipationSample | null }
  | { status: 'pending' | 'unavailable' };
export interface DashboardData {
  identityRevision:number;calculationVersion:number;subjectKind:WorkoutSubject['kind'];
  roster: RosterMember[];
  members: Member[];
  logs: ViewWorkoutLog[];
  lastSuccess: string | null;
  kpis: MonthlyKPIs;
  grassParticipation: GrassParticipation;
  currentStats?: Map<string, {week:number;streak:number;total:number}>;
}
