import os
from dotenv import load_dotenv
from mukmuk.discord import Discord

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
    print('서버 /잔디 · /기록갱신 명령어 등록 완료')

if __name__ == '__main__': main()
