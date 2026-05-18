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

## 배차(dispatch) 상태 흐름
```
scheduled → in_progress → completed
                         ↘ cancelled
```
- `scheduled` : 배차완료 (출발 전)
- `in_progress` : 운행 중 (인수 후)
- `completed` : 반납 완료
- `cancelled` : 취소

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
- `src/app/(mobile)/m/vehicles/page.tsx` — 차량 현황 (날짜별 가용 확인)

### 관리자 화면
- `src/app/(mobile)/m/manager/page.tsx` — 관리자 홈 (네이버 그린 #02AA4B 헤더)
- `src/app/(mobile)/m/manager/approvals/page.tsx` — 승인 관리 (검색/필터 포함)
- `src/app/(mobile)/m/manager/profile/page.tsx` — 내 정보

### 대시보드(admin) 화면
- `src/app/(dashboard)/vehicles/page.tsx` — 차량 현황 (카드 그리드)
- `src/app/(dashboard)/vehicle-management/page.tsx` — 차량 관리 (테이블, Excel 일괄 등록/다운로드)
- `src/app/(dashboard)/dispatches/page.tsx` — 배차 관리 (배차 처리 및 차량 변경)
- `src/app/(dashboard)/requests/page.tsx` — 신청 관리 목록
- `src/app/(dashboard)/requests/[id]/page.tsx` — 신청 상세

## 유틸리티

### vehicleName() — `src/lib/vehicle-utils.ts`
차량 이름 표시 시 반드시 이 함수를 사용한다. `name`(제조사)과 `model`(모델명)을 조합해 표시.
```typescript
export function vehicleName(vehicle: { name: string; model?: string | null } | null | undefined): string {
  if (!vehicle) return '-';
  return [vehicle.name, vehicle.model].filter(Boolean).join(' ');
}
// 예: { name: '현대', model: '스타리아' } → '현대 스타리아'
// 예: { name: '현대', model: null }      → '현대'
```

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

### 인증 / RLS 우회
- 일반 클라이언트 : `createClient()` — 현재 로그인 유저의 RLS 적용
- 관리자 클라이언트 : `createAdminClient()` — service role key 사용, RLS 완전 우회
  - **사용 위치** : `GET /api/requests/[id]`, `PUT /api/dispatches/[id]` 등 권한 문제가 발생하는 라우트
  - `import { createAdminClient } from '@/lib/server/supabase'`

### Supabase 다중 FK 주의사항
- `user_departments` 테이블이 `users` ↔ `departments` 간 경로를 2개 만들어 ambiguous FK 오류 발생
- **절대 금지** : `users` 조인 내부에 `department:departments(name)` 중첩 금지
- **올바른 패턴** : departments는 별도 컬럼(`department_id`)으로 직접 조인

### 페이지네이션
- `paginationSchema` : `page_size` 최대값 **500** (초과 시 Zod 파싱 에러 → 빈 데이터 반환)
- API 호출 시 `page_size=1000` 등 500 초과값 사용 금지

### 주요 엔드포인트
- `GET /api/dispatches?page_size=500` — 전체 배차 조회 (최대 500건)
- `GET /api/dispatches?my_trips=true&status=completed` — 완료된 운행 조회
  - `my_trips=true` 시 현재 유저의 모든 requests ID 기준으로 필터
- `POST /api/dispatches/[id]/complete` — 반납 완료 처리 (dispatches.status → completed, requests.status → returned)
- `POST /api/dispatches/[id]/start` — 운행 시작 (dispatches.status → in_progress)
- `GET /api/vehicles/available?start_datetime=&end_datetime=` — 특정 기간 가용 차량 조회
  - 응답에 `in_progress_ids` 포함 (현재 운행 중인 차량 ID 목록)
- `POST /api/auth/logout` — 로그아웃

## 차량 상태 표시 로직 (resolveStatus)
날짜 선택 여부에 따라 차량 상태 표시가 달라진다. 아래 규칙을 반드시 따른다.

```typescript
function resolveStatus(v: Vehicle): string {
  if (v.status === 'maintenance') return 'maintenance'; // 날짜 무관 항상 정비 중
  if (availableIds === null) return 'available';        // 날짜 미선택 → 정비 외 모두 사용 가능
  if (availableIds.has(v.id)) return 'available';
  if (inProgressIds.has(v.id)) return 'in_progress';
  return 'booked';
}
```
- 날짜 미선택: `maintenance`만 정비 중, 나머지 전체 사용 가능 (DB status 무시)
- 날짜 선택: `/api/vehicles/available` 결과 기준으로 판단
- `inactive` 차량은 목록에서 미리 필터링 (fetch 시 `v.status !== 'inactive'` 제외)

## 배차 차량 변경 (dispatch 수정)
- `PUT /api/dispatches/[id]` 에서 `vehicle_id` 변경 시 자동으로 차량 status swap 처리
  - 기존 차량 → `available`, 새 차량 → `in_use`
  - `is_rental=true` 인 경우 차량 status 변경 없음

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
- 테이블 줄바꿈 방지 : `<th>`, `<td>` 모두 `whitespace-nowrap` + 테이블 래퍼에 `overflow-x-auto` + `min-w-[900px]`
