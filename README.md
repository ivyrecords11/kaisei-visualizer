# KaiseiVisualizer Web

USTX 악보와 완성된 믹스 음원을 선택해 합창 노트와 피치선을 보여주는 MP4 영상을 만드는 브라우저용 앱입니다. 업로드한 파일은 브라우저 안에서만 처리됩니다.

## GitHub Pages

- 소스 코드는 저장소 루트에 있습니다.
- 현재 빌드 결과는 `docs/`에 있습니다.
- Pages 게시 방법: 저장소 **Settings → Pages → Build and deployment → Source**에서 **Deploy from a branch**를 선택한 뒤, **Branch: main / Folder: /docs**를 지정하고 Save를 누르세요.
- 설정 후 사이트: [https://ivyrecords11.github.io/kaisei-visualizer/](https://ivyrecords11.github.io/kaisei-visualizer/)

앱을 변경할 때는 Node.js 24와 pnpm 11.19 이상으로 `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`를 실행하고 생성된 `dist/` 내용을 `docs/`에 복사해 커밋하면 Pages가 게시합니다. GitHub Actions 배포 워크플로는 사용하지 않습니다.

## 기능 및 실행

완성 믹스 WAV/MP3와 USTX를 선택하고, 미리보기 후 H.264/AAC MP4로 저장합니다. 노트·가사·피치선, 캐릭터 표시와 여러 무대 설정을 제공합니다. 앱에는 서버 업로드 기능이 없으며 파일·음원은 공개 저장소나 Pages 빌드에 포함되지 않습니다.

로컬 개발은 `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm dev` 순서로 실행합니다. 저장 기능은 H.264/AAC 코덱을 지원하는 PC Chrome 또는 Edge가 필요합니다.
