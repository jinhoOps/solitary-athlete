import os
from dotenv import load_dotenv
from mukmuk.discord import Discord

def account_commands():
    user = {'name':'유저','description':'연결하거나 해제할 계정','type':6,'required':True}
    request = {'name':'요청','description':'현황에서 확인한 요청 번호','type':3,'required':True,'min_length':36,'max_length':36}
    def sub(name, description, options=()):
        return {'name':name,'description':description,'type':1,'options':list(options)}
    return [
        {'name':'계정연결','description':'두 계정의 동의와 관리자 검토로 하나의 잔디를 사용합니다.','type':1,
         'options':[sub('신청','대표 계정에서 보조 계정 연결을 신청합니다.',[user]),
                    sub('현황','내 계정과 요청을 확인하고 동의합니다.'),
                    sub('취소','승인 전 내 요청을 취소합니다.',[request]),
                    sub('해제','내 그룹의 보조 계정을 분리 요청합니다.',[user])]},
        {'name':'계정검토','description':'관리자가 계정 요청의 영향을 확인하고 검토합니다.','type':1,
         'default_member_permissions':'32','options':[sub('목록','검토 대기와 반영 대기 요청을 확인합니다.'),
                                                    sub('상세','영향을 확인하고 승인 또는 거절합니다.',[request])]},
    ]

def main():
    load_dotenv()
    api = Discord(os.environ['DISCORD_BOT_TOKEN'])
    app, guild = os.environ['DISCORD_APP_ID'], os.environ['DISCORD_GUILD_ID']
    api.request('POST',f'/applications/{app}/guilds/{guild}/commands',json={
        'name':'잔디','description':'최근 28일 운동 잔디와 메모를 조회합니다. 결과는 5분 뒤 사라집니다.',
        'type':1,'options':[{'name':'유저','description':'조회할 멤버 (비워두면 본인)','type':6,'required':False}],
    })
    api.request('POST',f'/applications/{app}/guilds/{guild}/commands',json={
        'name':'기록갱신','description':'본인 또는 관리자가 지정한 멤버의 수정·삭제된 인증을 다시 확인합니다.',
        'type':1,'default_member_permissions':None,
        'options':[{'name':'유저','description':'생략하면 본인. 다른 멤버 지정은 관리자만 가능합니다.','type':6,'required':False}],
    })
    if os.getenv('MUKMUK_ACCOUNT_LINK_ENABLED', 'false').lower() in ('true', '1'):
        for command in account_commands():
            api.request('POST', f'/applications/{app}/guilds/{guild}/commands', json=command)
    print('서버 명령어 등록 완료')

if __name__ == '__main__': main()
