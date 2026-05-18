@AGENTS.md

# 차량 신청 관리 시스템 - 프로젝트 컨텍스트

## 기술 스택
- Next.js App Router (서버 컴포넌트 + 클라이언트 컴포넌트 혼용)
- Supabase (DB + Auth)
- Tailwind CSS
- date-fns (날짜 포맷, locale: ko)

## 사용자 역할
- `admin` : 차량위원회 (관리자) — 최종 승인권자
- `manager` : 부서관리자 — 1단계 상위 승인
- `user` : 일반 신청자

## 모바일 라우팅
- `/m/*` : 일반 신청자 화면 (`src/app/(mobile)/m/`)
- `/m/manager/*` : 부서관리자 화면

## 신청 상태 흐름
```
pending → upper_approved → approved → dispatched → in_use → returned
                ↓               ↓
            rejected         on_hold
```

## 주요 컴포넌트

### 공통
- `src/components/mobile/LogoutButton.tsx` — 로그아웃 버튼 (클라이언트 컴포넌트, `/api/auth/logout` POST)
- `src/components/mobile/MobileNav.tsx` — 신청자 하단 네비게이션
- `src/components/mobile/ManagerNav.tsx` — 관리자 하단 네비게이션
- `src/components/mobile/RequestListClient.tsx` — 신청 목록 (N 배지 포함, 클라이언트 컴포넌트)

### 신청자 화면
- `src/app/(mobile)/m/page.tsx` — 홈 (서버 컴포넌트, 파란 그라데이션 헤더)
- `src/app/(mobile)/m/requests/page.tsx` — 신청 목록 (서버 컴포넌트 → RequestListClient로 전달)
- `src/app/(mobile)/m/requests/[id]/page.tsx` — 신청 상세 (클라이언트 컴포넌트)
- `src/app/(mobile)/m/trips/page.tsx` — 운행 관리 (인수/반납 처리)

### 관리자 화면
- `src/app/(mobile)/m/manager/page.tsx` — 관리자 홈 (네이버 그린 #02AA4B 헤더)
- `src/app/(mobile)/m/manager/approvals/page.tsx` — 승인 관리 (검색/필터 포함)
- `src/app/(mobile)/m/manager/profile/page.tsx` — 내 정보

## 색상 테마
- **신청자** : `from-blue-600 to-blue-700` (파란 그라데이션)
- **관리자** : `bg-[#02AA4B]` (네이버 그린 계열 단색)
- **공통 디자인 토큰** : `rounded-2xl`, `shadow-sm`, `border-gray-100`

## N 배지 시스템 (신규 알림)
- **대상 상태** : `approved` (차량위원회 승인), `dispatched` (배차완료)
- **localStorage 키** : `seen_notifications` (배열, 읽은 request ID 저장)
- **이벤트** : `window.dispatchEvent(new Event('notification-seen'))` — 읽음 처리 시 발생
- **MobileNav** : `/api/requests?status=approved`, `?status=dispatched` 두 번 fetch → 미읽음 수 표시
- **RequestListClient** : 마운트 시 localStorage 읽어 N 배지 표시
- **상세 페이지** : `approved` 또는 `dispatched` 상태 열람 시 자동 읽음 처리

## API 주요 사항
- `GET /api/dispatches?my_trips=true&status=completed` — 완료된 운행 조회 가능
  - `my_trips=true` 시 현재 유저의 모든 requests ID 기준으로 필터 (상태 무관)
- `POST /api/dispatches/[id]/complete` — 반납 완료 처리 (dispatches.status → completed, requests.status → returned)
- `POST /api/auth/logout` — 로그아웃

## 운행 관리 페이지 섹션 순서
1. 운행 중 (in_progress)
2. 인수 대기 (scheduled)
3. 배차 대기 (upper_approved, approved)
4. 완료된 운행 (completed) — 최근 10건

## 승인 관리 페이지 필터
- 텍스트 검색 : 신청자 이름 · 부서 · 목적지 동시 검색 (항상 표시)
- 차량군 / 신청부서 : 드롭다운 (필터 패널)
- 출발일 범위 : date picker (필터 패널)
- 초기화 : `resetAll()` 함수로 전체 초기화

## 주요 UI 규칙
- 모달 하단 시트 : `pb-28 max-h-[90vh] overflow-y-auto` (하단 네비 가림 방지)
- Nav active 판별 : `pathname === item.href || pathname.startsWith(item.href + '/')` (슬래시 필수)
- 사이드바 시스템 관리 구분선 : `——— 시스템 관리 ———` 양쪽 hr 라인
