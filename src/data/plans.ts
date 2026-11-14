import type { SubscriptionPlan, SystemSettingsState } from '../types/garage';

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan_starter',
    name: 'Starter Bay',
    targetAudience: 'For independent single-bay workshops',
    monthlyPriceUsd: 29,
    monthlyMessageCap: 500,
    maxStaffUsers: 3,
    features: [
      'Excel & CSV job card import (up to 1,000 rows/batch)',
      'Delivered vehicle auto-detection',
      '500 WhatsApp delivery notifications / month',
      'Google Review & 2 social links',
    ],
  },
  {
    id: 'plan_growth',
    name: 'Multi-Bay Pro',
    targetAudience: 'For busy multi-bay service centers',
    monthlyPriceUsd: 69,
    monthlyMessageCap: 2500,
    maxStaffUsers: 12,
    features: [
      'Unlimited Excel & CSV job card imports',
      'Custom per-garage WhatsApp templates',
      '2,500 WhatsApp delivery & review invites / month',
      'Custom garage branding & full link suite',
    ],
  },
  {
    id: 'plan_group',
    name: 'Service Group',
    targetAudience: 'For multi-branch franchise garages',
    monthlyPriceUsd: 149,
    monthlyMessageCap: 10000,
    maxStaffUsers: 40,
    features: [
      'Dedicated tenant isolation across branches',
      '10,000 WhatsApp messages / month',
      'Priority WhatsApp Cloud API onboarding',
      'Role-based Admin & Staff permissions',
    ],
  },
];

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsState = {
  platformName: 'GARAGE-CONNECT-APP',
  enforceStrictTenantIsolation: true,
  allowGarageSelfOnboarding: true,
  supabaseProjectUrl: '',
  supabaseConnection: 'not_connected',
  whatsappCloudApiConnection: 'not_connected',
};

/**
 * Generates a blank-structure sample CSV file on demand so users can test
 * uploading a real file on the Import Excel screen without storing fake records in app state.
 */
export function buildSampleJobCardCsv(): string {
  const headers = [
    'Job Card No',
    'Customer Name',
    'WhatsApp Phone',
    'Vehicle Reg',
    'Vehicle Model',
    'Service Type',
    'Status',
  ];
  const rows = [
    ['JC-1042', 'Arjun Mehta', '+919820112233', 'MH02DN4512', 'Hyundai Creta SX', 'Periodic Maintenance', 'Delivered'],
    ['JC-1043', 'Kavita Krishnan', '+919845098765', 'KA05MJ8821', 'Honda City ZX', 'AC & Brake Service', 'Delivered'],
    ['JC-1044', 'Sameer Joshi', '+919765432109', 'MH14GT3310', 'Tata Harrier', 'Bodywork & Paint', 'In Progress'],
    ['JC-1045', 'Neha Kulkarni', '+919811445566', 'DL08CA7741', 'Maruti Baleno', 'Wheel Alignment', 'Ready for Delivery'],
  ];
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
