# Neon Strike

GitHub Pages에 배포할 정적 웹 FPS 클라이언트와 Railway에 배포할 WebSocket 서버를 한 저장소에 함께 둔 시작점입니다.

## 구성

- 루트: GitHub Pages에 배포하는 정적 클라이언트
- server: Railway에 배포하는 Node.js WebSocket 서버

## 로컬 실행

### 1. 서버 실행

```bash
cd server
npm install
npm start
```

기본 포트는 2567입니다.

### 2. 클라이언트 실행

정적 파일만 있으면 되므로 루트 폴더를 아무 HTTP 서버로 열면 됩니다.

예시:

```bash
cd ..
python3 -m http.server 4173
```

브라우저에서 http://localhost:4173 로 접속한 뒤 서버 주소를 ws://localhost:2567 로 두고 접속합니다.

## GitHub Pages 배포

루트 파일들이 그대로 정적 사이트이며, main 브랜치에 push되면 GitHub Actions 워크플로가 자동으로 배포합니다.

- 기본 워크플로: .github/workflows/deploy-pages.yml
- 첫 설정에서 Pages 항목이 비어 있으면 Settings > Pages에서 Source를 GitHub Actions로 선택
- 이후에는 main에 push할 때마다 자동 배포

배포 주소는 보통 다음 형태입니다.

```text
https://mahyun-dev.github.io/test/
```

배포 후 클라이언트의 서버 주소 입력란에 Railway에서 발급받은 wss 주소를 넣습니다.

## Railway 배포

저장소 루트에 railway.toml을 넣어두었기 때문에 서비스 루트를 따로 server로 잡지 않아도 됩니다.

- New Project > Deploy from GitHub repo
- Repository: mahyun-dev/test
- Root Directory는 비워둬도 됨
- Railway가 railway.toml의 build/start 명령을 사용
- Railway가 제공하는 PORT 환경변수를 그대로 사용

배포가 끝나면 wss://...up.railway.app 같은 주소를 클라이언트에 입력하면 됩니다.

현재 설정은 다음과 같습니다.

- Build Command: cd server && npm install
- Start Command: cd server && npm start
- Watch Patterns: server/**

## 현재 포함된 기능

- 1인 연습 모드
- WASD 이동, 점프, 질주
- 사격, 재장전, 점수 HUD
- 더미 타깃 연습장
- 최대 4인 룸 접속용 위치 동기화 서버

## 다음 확장 추천

- 서버 권한 기반 히트 판정
- 팀 고정 배정과 점수판
- 리스폰 시스템
- 실제 총기 모델, 사운드, VFX
- 모바일 대응 대신 데스크톱 우선 최적화