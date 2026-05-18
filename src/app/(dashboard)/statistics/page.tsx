'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ── 색상 팔레트 ────────────────────────────────────────────────────
const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];

const MONTHS_OPTIONS = [
  { label: '3개월', value: 3 },
  { label: '6개월', value: 6 },
  { label: '12개월', value: 12 },
];

const TABS = [
  { key: 'overview',      label: '개요' },
  { key: 'monthly',       label: '신청/배차 현황' },
  { key: 'utilization',   label: '차량 가동률' },
  { key: 'departments',   label: '부서별 현황' },
  { key: 'purposes',      label: '목적/목적지 분석' },
];

// ── 공통 카드 ──────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text-gray-900' }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-medium text-gray-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-bold text-gray-700 mb-3">{children}</h2>;
}

// ── 개요 탭 ───────────────────────────────────────────────────────
function OverviewTab({ months }: { months: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=overview&months=${months}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [months]);

  if (loading) return <Loader />;
  if (!data)   return null;

  const { vehicles, requests, dispatches } = data;

  return (
    <div className="space-y-6">
      {/* 차량 현황 */}
      <div>
        <SectionTitle>차량 현황</SectionTitle>
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="전체"     value={vehicles.total}       color="text-gray-900" />
          <StatCard label="사용 가능" value={vehicles.available}   color="text-green-600" />
          <StatCard label="운행 중"   value={vehicles.in_use}      color="text-blue-600" />
          <StatCard label="정비 중"   value={vehicles.maintenance} color="text-orange-500" />
          <StatCard label="비활성"    value={vehicles.inactive}    color="text-gray-400" />
        </div>
      </div>

      {/* 신청 현황 */}
      <div>
        <SectionTitle>신청 현황 (전체)</SectionTitle>
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="총 신청"   value={requests.total}      />
          <StatCard label="이번 달"   value={requests.this_month} color="text-blue-600" />
          <StatCard label="승인완료"  value={requests.approved}   color="text-green-600" />
          <StatCard label="처리 대기" value={requests.pending}    color="text-orange-500" />
          <StatCard label="취소"      value={requests.cancelled}  color="text-red-400" />
        </div>
      </div>

      {/* 배차 현황 */}
      <div>
        <SectionTitle>배차 현황 (전체)</SectionTitle>
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="총 배차"   value={dispatches.total}       />
          <StatCard label="배차완료"  value={dispatches.scheduled}   color="text-blue-600" />
          <StatCard label="운행 중"   value={dispatches.in_progress} color="text-purple-600" />
          <StatCard label="반납완료"  value={dispatches.completed}   color="text-green-600" />
        </div>
      </div>

      {/* 도넛 차트 2개 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>차량 상태 분포</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={[
                { name: '사용 가능', value: vehicles.available },
                { name: '운행 중',   value: vehicles.in_use },
                { name: '정비 중',   value: vehicles.maintenance },
                { name: '비활성',    value: vehicles.inactive },
              ]} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" label={({ name, percent = 0 }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {['#10b981','#3b82f6','#f59e0b','#9ca3af'].map((c, i) => <Cell key={i} fill={c} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>신청 결과 분포</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={[
                { name: '승인완료',  value: requests.approved },
                { name: '처리대기',  value: requests.pending },
                { name: '취소',      value: requests.cancelled },
              ]} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" label={({ name, percent = 0 }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {['#10b981','#f59e0b','#ef4444'].map((c, i) => <Cell key={i} fill={c} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── 월별 신청/배차 현황 탭 ─────────────────────────────────────────
function MonthlyTab({ months }: { months: number }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=monthly&months=${months}`)
      .then(r => r.json()).then(j => { setData(j.data || []); setLoading(false); });
  }, [months]);

  if (loading) return <Loader />;

  const total     = data.reduce((s, d) => s + d.requests, 0);
  const approved  = data.reduce((s, d) => s + d.approved, 0);
  const cancelled = data.reduce((s, d) => s + d.cancelled, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label={`${months}개월 총 신청`}  value={total}     />
        <StatCard label="승인완료"                  value={approved}  color="text-green-600" />
        <StatCard label="취소"                      value={cancelled} color="text-red-400" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>월별 신청 건수 추이</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="requests"  name="총 신청"  fill="#3b82f6" radius={[4,4,0,0]} />
            <Bar dataKey="approved"  name="승인완료" fill="#10b981" radius={[4,4,0,0]} />
            <Bar dataKey="cancelled" name="취소"     fill="#f87171" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>월별 배차 건수 추이</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="dispatches" name="배차 건수" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 차량 가동률 탭 ────────────────────────────────────────────────
function UtilizationTab({ months }: { months: number }) {
  const [data, setData]   = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=utilization&months=${months}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [months]);

  if (loading) return <Loader />;
  if (!data)   return null;

  const { monthly, vehicles } = data;
  const avgRate = monthly.length > 0 ? Math.round(monthly.reduce((s: number, m: any) => s + m.rate, 0) / monthly.length) : 0;
  const maxUsed = Math.max(...vehicles.map((v: any) => v.count), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="평균 가동률"   value={`${avgRate}%`}              color={avgRate >= 60 ? 'text-green-600' : 'text-orange-500'} />
        <StatCard label="운행 차량 수"  value={vehicles.filter((v: any) => v.count > 0).length} sub={`전체 ${vehicles.length}대`} />
        <StatCard label="미사용 차량"   value={vehicles.filter((v: any) => v.count === 0).length} color="text-gray-400" sub="기간 내 운행 없음" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>월별 가동률 추이</SectionTitle>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: any) => `${v}%`} />
            <Legend />
            <Line type="monotone" dataKey="rate" name="가동률" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>차량별 운행 건수 (기간 합계)</SectionTitle>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {vehicles.map((v: any, i: number) => (
            <div key={v.id} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium text-gray-800 truncate">{v.name}</span>
                  <span className="text-xs text-gray-400 font-mono ml-2 flex-shrink-0">{v.license_plate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${(v.count / maxUsed) * 100}%`, backgroundColor: v.count === 0 ? '#e5e7eb' : COLORS[i % COLORS.length] }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-600 w-8 text-right">{v.count}건</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 부서별 현황 탭 ────────────────────────────────────────────────
function DepartmentsTab({ months }: { months: number }) {
  const [data, setData]   = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=departments&months=${months}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [months]);

  if (loading) return <Loader />;
  if (!data)   return null;

  const { ranking, monthly, top_depts } = data;
  const total = ranking.reduce((s: number, d: any) => s + d.count, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        {/* 순위 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>부서별 운행 건수 순위</SectionTitle>
          <div className="space-y-2.5">
            {ranking.slice(0, 10).map((d: any, i: number) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className={`text-xs font-bold w-5 text-center rounded ${i < 3 ? 'text-blue-600' : 'text-gray-400'}`}>{i + 1}</span>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-sm font-medium text-gray-800">{d.name}</span>
                    <span className="text-xs text-gray-500">{d.count}건 ({total > 0 ? Math.round(d.count / total * 100) : 0}%)</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full" style={{ width: `${total > 0 ? (d.count / ranking[0].count) * 100 : 0}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 파이 차트 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>부서별 비중</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={ranking.slice(0, 8)} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="count" nameKey="name" label={({ name, percent = 0 }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}>
                {ranking.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any, name: any) => [`${v}건`, name]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 월별 부서 추이 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>월별 부서 운행 추이 (상위 5개)</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthly} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            {top_depts.slice(0, 5).map((dept: string, i: number) => (
              <Bar key={dept} dataKey={dept} name={dept} fill={COLORS[i % COLORS.length]} radius={[3,3,0,0]} stackId="a" />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 목적/목적지 분석 탭 ───────────────────────────────────────────
function PurposesTab({ months }: { months: number }) {
  const [data, setData]   = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=purposes&months=${months}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [months]);

  if (loading) return <Loader />;
  if (!data)   return null;

  const { purposes, destinations, by_day, monthly } = data;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        {/* 사용목적 파이 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>사용목적별 비중</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={purposes} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="count" nameKey="name" label={({ name, percent = 0 }) => percent > 0.06 ? `${name} ${(percent*100).toFixed(0)}%` : ''}>
                {purposes.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any, n: any) => [`${v}건`, n]} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 요일별 출발 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>요일별 출발 건수</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={by_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 13 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" name="출발 건수" radius={[5,5,0,0]}>
                {by_day.map((_: any, i: number) => <Cell key={i} fill={i === 0 || i === 6 ? '#ef4444' : '#3b82f6'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 목적지 TOP 10 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>주요 목적지 TOP 10</SectionTitle>
        {destinations.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">데이터가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {destinations.map((d: any, i: number) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className={`text-xs font-bold w-5 text-center ${i < 3 ? 'text-blue-600' : 'text-gray-400'}`}>{i + 1}</span>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-sm text-gray-800 truncate">{d.name}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{d.count}건</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${(d.count / destinations[0].count) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 월별 운행 추이 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>월별 운행 건수 추이</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="count" name="운행 건수" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function StatisticsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [months, setMonths]       = useState(6);

  return (
    <div className="p-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">통계</h1>
          <p className="text-gray-500 mt-1 text-sm">차량 운영 현황을 분석합니다</p>
        </div>
        {/* 기간 선택 */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {MONTHS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setMonths(opt.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                months === opt.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'overview'    && <OverviewTab    months={months} />}
      {activeTab === 'monthly'     && <MonthlyTab     months={months} />}
      {activeTab === 'utilization' && <UtilizationTab months={months} />}
      {activeTab === 'departments' && <DepartmentsTab months={months} />}
      {activeTab === 'purposes'    && <PurposesTab    months={months} />}
    </div>
  );
}
