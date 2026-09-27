// FBI IC3 2025 Elder Fraud — victims age 60+, by state.
//
// Dataset split for Community Watch (do not mix these up):
//   National choropleth / state table → THIS file (public IC3).
//   Atlanta ZIP map + campaigns      → ScamShield reports (demo + live).
//   Warning network                  → ScamShield only (how our warnings travel).
// FTC Sentinel is metro/state, not ZIP, so it is not used for the Atlanta map.
//
// Source: FBI IC3 2025 Elder Fraud state reports
//   https://www.ic3.gov/AnnualReport/Reports/2025EFState/
// National headline in the same year's report: $7.748B / 201,266 complaints (60+).
// State rows sum a bit lower because some complaints are not assigned to a state.
// Alabama (2,057 / $58,838,411) matches the official IC3 Alabama page exactly.

export const IC3_STATES_SOURCE = "ic3_2025_elder";
export const IC3_STATES_YEAR = 2025;

export type Ic3StateRow = {
  state: string;
  name: string;
  losses_usd: number;
  complaints: number;
};

export const ic3ElderFraud2025: Ic3StateRow[] = [
  { state: "CA", name: "California", losses_usd: 1_403_975_911, complaints: 22_157 },
  { state: "FL", name: "Florida", losses_usd: 709_823_172, complaints: 17_147 },
  { state: "TX", name: "Texas", losses_usd: 678_564_081, complaints: 14_410 },
  { state: "NY", name: "New York", losses_usd: 408_741_632, complaints: 8_537 },
  { state: "AZ", name: "Arizona", losses_usd: 343_984_935, complaints: 9_834 },
  { state: "NJ", name: "New Jersey", losses_usd: 249_808_786, complaints: 4_111 },
  { state: "VA", name: "Virginia", losses_usd: 220_941_233, complaints: 5_509 },
  { state: "GA", name: "Georgia", losses_usd: 218_218_618, complaints: 4_865 },
  { state: "PA", name: "Pennsylvania", losses_usd: 215_887_466, complaints: 7_088 },
  { state: "IL", name: "Illinois", losses_usd: 189_491_209, complaints: 7_701 },
  { state: "WA", name: "Washington", losses_usd: 179_706_909, complaints: 5_392 },
  { state: "MD", name: "Maryland", losses_usd: 176_380_737, complaints: 4_573 },
  { state: "MI", name: "Michigan", losses_usd: 169_931_948, complaints: 5_731 },
  { state: "NC", name: "North Carolina", losses_usd: 164_214_173, complaints: 5_942 },
  { state: "OH", name: "Ohio", losses_usd: 163_748_647, complaints: 6_948 },
  { state: "CO", name: "Colorado", losses_usd: 144_529_956, complaints: 4_061 },
  { state: "NV", name: "Nevada", losses_usd: 115_267_384, complaints: 3_008 },
  { state: "MA", name: "Massachusetts", losses_usd: 113_880_471, complaints: 5_463 },
  { state: "MN", name: "Minnesota", losses_usd: 111_387_313, complaints: 2_550 },
  { state: "TN", name: "Tennessee", losses_usd: 108_305_976, complaints: 3_525 },
  { state: "SC", name: "South Carolina", losses_usd: 97_344_480, complaints: 3_136 },
  { state: "WI", name: "Wisconsin", losses_usd: 92_041_492, complaints: 3_014 },
  { state: "MO", name: "Missouri", losses_usd: 91_563_419, complaints: 3_247 },
  { state: "IN", name: "Indiana", losses_usd: 81_517_309, complaints: 4_199 },
  { state: "OR", name: "Oregon", losses_usd: 77_481_475, complaints: 2_910 },
  { state: "CT", name: "Connecticut", losses_usd: 73_178_714, complaints: 2_360 },
  { state: "UT", name: "Utah", losses_usd: 65_946_070, complaints: 2_341 },
  { state: "KY", name: "Kentucky", losses_usd: 64_441_069, complaints: 2_127 },
  { state: "AL", name: "Alabama", losses_usd: 58_838_411, complaints: 2_057 },
  { state: "NM", name: "New Mexico", losses_usd: 55_820_259, complaints: 1_449 },
  { state: "KS", name: "Kansas", losses_usd: 55_730_977, complaints: 2_013 },
  { state: "HI", name: "Hawaii", losses_usd: 55_385_929, complaints: 917 },
  { state: "OK", name: "Oklahoma", losses_usd: 53_333_350, complaints: 2_449 },
  { state: "IA", name: "Iowa", losses_usd: 44_136_901, complaints: 1_202 },
  { state: "ID", name: "Idaho", losses_usd: 37_394_229, complaints: 1_136 },
  { state: "AR", name: "Arkansas", losses_usd: 36_958_369, complaints: 1_658 },
  { state: "LA", name: "Louisiana", losses_usd: 35_856_847, complaints: 1_906 },
  { state: "MS", name: "Mississippi", losses_usd: 33_087_218, complaints: 959 },
  { state: "MT", name: "Montana", losses_usd: 31_773_898, complaints: 814 },
  { state: "NE", name: "Nebraska", losses_usd: 28_430_567, complaints: 781 },
  { state: "NH", name: "New Hampshire", losses_usd: 25_068_671, complaints: 1_063 },
  { state: "ME", name: "Maine", losses_usd: 23_317_413, complaints: 721 },
  { state: "RI", name: "Rhode Island", losses_usd: 21_561_918, complaints: 581 },
  { state: "WV", name: "West Virginia", losses_usd: 18_953_441, complaints: 931 },
  { state: "AK", name: "Alaska", losses_usd: 16_252_410, complaints: 666 },
  { state: "DE", name: "Delaware", losses_usd: 16_189_240, complaints: 796 },
  { state: "SD", name: "South Dakota", losses_usd: 14_708_875, complaints: 398 },
  { state: "VT", name: "Vermont", losses_usd: 8_548_782, complaints: 436 },
  { state: "WY", name: "Wyoming", losses_usd: 5_923_260, complaints: 397 },
  { state: "ND", name: "North Dakota", losses_usd: 5_895_155, complaints: 251 },
];

export const ic3StateName: Record<string, string> = Object.fromEntries(
  ic3ElderFraud2025.map((row) => [row.state, row.name]),
);

export function formatUsdCompact(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 10_000_000) return `$${Math.round(value / 1_000_000)}M`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(value / 1_000)}K`;
}
