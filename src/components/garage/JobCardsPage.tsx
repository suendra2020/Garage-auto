import React, { useState } from 'react';
import { CheckCircle2, ClipboardList, Clock, Search } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { EmptyState } from '../common/EmptyState';

export function JobCardsPage() {
  const { tenantJobCards, markJobCardDelivered, setGaragePage } = useAppState();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'delivered' | 'in_progress'>('all');

  const filtered = tenantJobCards.filter((card) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'delivered' ? card.isDelivered : !card.isDelivered);
    const q = search.trim().toLowerCase();
    const matchesQuery =
      !q ||
      card.jobCardNumber.toLowerCase().includes(q) ||
      card.customerName.toLowerCase().includes(q) ||
      card.vehicleRegistration.toLowerCase().includes(q) ||
      card.vehicleModel.toLowerCase().includes(q);
    return matchesFilter && matchesQuery;
  });

  if (tenantJobCards.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No job cards imported for this garage yet"
        description="Import an Excel or CSV job card file to populate your service history and detect delivered vehicles."
        actionLabel="Import Excel File"
        onAction={() => setGaragePage('import-excel')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search job cards"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job card #, customer, or reg plate..."
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900"
          />
        </div>

        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {(
            [
              { id: 'all', label: `All (${tenantJobCards.length})` },
              {
                id: 'delivered',
                label: `Delivered (${tenantJobCards.filter((c) => c.isDelivered).length})`,
              },
              {
                id: 'in_progress',
                label: `Other (${tenantJobCards.filter((c) => !c.isDelivered).length})`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-white text-navy-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching job cards"
          description="Try adjusting your search query or status filter."
          actionLabel="Clear Filters"
          onAction={() => {
            setSearch('');
            setFilter('all');
          }}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3.5">Job Card</th>
                  <th className="px-5 py-3.5">Customer &amp; Phone</th>
                  <th className="px-5 py-3.5">Vehicle</th>
                  <th className="px-5 py-3.5">Service</th>
                  <th className="px-5 py-3.5">Delivery Status</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((card) => (
                  <tr key={card.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-900">
                      {card.jobCardNumber}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{card.customerName}</p>
                      <p className="font-mono text-xs text-slate-500">
                        {card.phoneNumber || 'No phone'}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-mono text-xs font-semibold text-slate-900">
                        {card.vehicleRegistration}
                      </p>
                      <p className="text-xs text-slate-500">{card.vehicleModel}</p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">{card.serviceType}</td>
                    <td className="px-5 py-3.5">
                      {card.isDelivered ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Delivered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                          <Clock className="h-4 w-4" aria-hidden="true" />
                          {card.rawStatus}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => markJobCardDelivered(card.id, !card.isDelivered)}
                        className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                      >
                        {card.isDelivered ? 'Mark Not Delivered' : 'Mark Delivered'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-slate-200 md:hidden">
            {filtered.map((card) => (
              <li key={card.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">
                      {card.customerName}{' '}
                      <span className="font-mono text-xs text-slate-500">
                        · {card.jobCardNumber}
                      </span>
                    </p>
                    <p className="text-xs text-slate-600">
                      <span className="font-mono font-medium">{card.vehicleRegistration}</span> ·{' '}
                      {card.vehicleModel}
                    </p>
                  </div>
                  {card.isDelivered ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Delivered
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">{card.rawStatus}</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-slate-500">
                    {card.phoneNumber || 'No phone number'}
                  </span>
                  <button
                    type="button"
                    onClick={() => markJobCardDelivered(card.id, !card.isDelivered)}
                    className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800"
                  >
                    {card.isDelivered ? 'Mark Not Delivered' : 'Mark Delivered'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
