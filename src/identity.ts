import type {WorkoutLog,ViewWorkoutLog,WorkoutEntry,WorkoutSubject,PersonWorkoutDTO} from './types';
export interface DashboardIdentity {enabled:boolean;revision:number;calculation_version:number}
export function parseIdentity(rows:DashboardIdentity[]):DashboardIdentity {
 const identity=rows[0];
 if(rows.length!==1||!identity||typeof identity.enabled!=='boolean'||!Number.isSafeInteger(identity.revision)||identity.revision<0||!Number.isSafeInteger(identity.calculation_version)||identity.calculation_version<1)throw new Error('Invalid dashboard identity');
 return identity;
}
export const subjectOf=(log:WorkoutEntry):WorkoutSubject=>'subject' in log?log.subject:{kind:'discord',id:log.user_id};
export function legacyLog({user_id,...row}:WorkoutLog):ViewWorkoutLog{return {...row,subject:{kind:'discord',id:user_id}};}
export function personLog({person_id,identity_revision,...row}:PersonWorkoutDTO,revision:number):ViewWorkoutLog{
 if(identity_revision!==revision)throw new Error('identity_revision_changed');
 if(typeof person_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(person_id))throw new Error('Invalid person identity');
 return {...row,subject:{kind:'person',id:person_id}};
}
