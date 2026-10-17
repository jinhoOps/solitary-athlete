export interface RefreshReceipt {id:string;status:string;total:number;checked:number;removed:number}
export function formatRefresh(job:RefreshReceipt,interactionId:string):string {
 const footer='\n이 안내는 본인에게만 보이며 5분 뒤 사라져요.';
 if(job.status==='done'&&job.total===0)return '갱신할 운동 기록이 없어요.'+footer;
 const title=job.id===interactionId?'기록 갱신을 접수했어요.':'기록을 갱신하고 있어요. 중복 요청은 만들지 않았어요.';
 return `${title}\n확인 ${job.checked}/${job.total}건 · 삭제 ${job.removed}건\n다음 수집부터 나누어 확인해요. 처리 중 다시 호출하면 진행 상황을 볼 수 있어요.${footer}`;
}
