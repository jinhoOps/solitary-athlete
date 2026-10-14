export interface WorkoutLog {
  user_id: string; username: string; log_date: string; memo: string;
  has_photo: boolean; verification_count: number;
}
export interface Member {
  id: string; name: string; dates: Set<string>; photos: Set<string>;
}
export interface PublicConfig { url: string; key: string }
export interface DashboardData { members: Member[]; logs: WorkoutLog[]; lastSuccess: string | null }
