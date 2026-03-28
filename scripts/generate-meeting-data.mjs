import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const outputPath = resolve(process.cwd(), 'public/data/meetingData.json');
mkdirSync(dirname(outputPath), { recursive: true });

const departments = [
  'Operations',
  'Sales',
  'Marketing',
  'Product',
  'Finance',
  'Customer Success',
];

const campaigns = [
  'Q1 Pipeline',
  'Retention Sprint',
  'Enterprise Push',
  'Launch Wave',
  'Referral Boost',
  'Expansion Drive',
];

const titlePrefixes = [
  'Standup',
  'Review',
  'Planning',
  'Sync',
  'Check-in',
  'Retro',
  'Strategy',
  'Workshop',
];

const participantsByDepartment = {
  Operations: ['Ava', 'Liam', 'Zoe', 'Micah', 'Noah'],
  Sales: ['Maya', 'Ethan', 'Nia', 'Jonah', 'Leah'],
  Marketing: ['Ivy', 'Caleb', 'Sara', 'Mila', 'Ezra'],
  Product: ['Aria', 'Theo', 'Nolan', 'Luca', 'Ruby'],
  Finance: ['Mason', 'Ella', 'Ryan', 'Jade', 'Iris'],
  'Customer Success': ['Owen', 'Skye', 'Aiden', 'Cora', 'Ben'],
};

const executiveOwner = 'Jacques';
const internalCompany = 'Denteel';

const externalStakeholders = [
  { name: 'Anika Shah', company: 'Helios Retail' },
  { name: 'Mark Dalton', company: 'Northwind Capital' },
  { name: 'Priya Menon', company: 'Vertex Logistics' },
  { name: 'Jacob Reed', company: 'Summit Health' },
  { name: 'Lea Novak', company: 'Orion Ventures' },
  { name: 'Tom Alvarez', company: 'Cascade Group' },
  { name: 'Rina Bose', company: 'Brightfield Systems' },
  { name: 'Omar Siddiq', company: 'BlueAnchor Partners' },
];

const allInternalStaff = Array.from(new Set(Object.values(participantsByDepartment).flat()));

const startDate = new Date();
startDate.setMinutes(0, 0, 0);
startDate.setHours(startDate.getHours() - (24 * 180));

function pick(array, indexSeed) {
  return array[indexSeed % array.length];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getMeetingAudienceType(staffCount, externalCount) {
  if (staffCount > 0 && externalCount > 0) {
    return 'mixed';
  }

  if (externalCount > 0) {
    return 'external';
  }

  return 'staff';
}

const records = [];
let meetingId = 1;

for (let hourOffset = 0; hourOffset < 24 * 180; hourOffset += 1) {
  const current = new Date(startDate);
  current.setHours(startDate.getHours() + hourOffset);

  const hour = current.getHours();
  const day = current.getDay();
  const isWeekday = day >= 1 && day <= 5;
  const monthFactor = current.getMonth() % 3;
  const hourWave = Math.sin(hourOffset / 18) * 0.7;
  const dayWave = Math.cos(hourOffset / 36) * 0.5;

  const baseIntensity = isWeekday ? 1.8 : 0.45;
  const officeHoursBoost = hour >= 8 && hour <= 17 ? 1.6 : 0.55;
  const middayBoost = hour >= 10 && hour <= 14 ? 0.8 : 0;
  const expectedMeetings = clamp(
    Math.round(baseIntensity + officeHoursBoost + middayBoost + hourWave + dayWave + monthFactor * 0.25),
    0,
    5,
  );

  for (let meetingIndex = 0; meetingIndex < expectedMeetings; meetingIndex += 1) {
    const department = pick(departments, hourOffset + meetingIndex * 3 + day);
    const campaign = pick(campaigns, hourOffset + meetingIndex * 5 + monthFactor);
    const startMinute = ((meetingIndex * 15) + (hourOffset % 4) * 5) % 60;
    const scheduledDurationMinutes = pick([30, 45, 60, 75, 90], hourOffset + meetingIndex + day);
    const durationShift = pick([-20, -10, 0, 5, 10, 15, 25], hourOffset + meetingIndex * 7 + hour);
    const actualDurationMinutes = clamp(scheduledDurationMinutes + durationShift, 15, 140);
    const date = new Date(current);
    date.setMinutes(startMinute, 0, 0);

    const participantsPool = participantsByDepartment[department];
    const ownerCategory = ((hourOffset + meetingIndex + day) % 5 === 0 || department === 'Operations') ? 'by-you' : 'by-other-staff';
    const ownerName = ownerCategory === 'by-you'
      ? executiveOwner
      : participantsPool[(hourOffset + meetingIndex * 2) % participantsPool.length];

    const audienceModeSeed = (hourOffset + meetingIndex + day + monthFactor) % 10;
    const audienceMode = audienceModeSeed < 6 ? 'staff' : audienceModeSeed < 8 ? 'external' : 'mixed';

    const attendeeCount = 1 + ((meetingIndex + hourOffset) % 4);
    const staffAttendeeTarget = audienceMode === 'staff' ? attendeeCount : audienceMode === 'external' ? 0 : clamp(attendeeCount - 1, 1, attendeeCount);
    const externalAttendeeTarget = attendeeCount - staffAttendeeTarget;

    const staffAttendees = Array.from({ length: staffAttendeeTarget }, (_, index) => {
      return participantsPool[(index + hourOffset + meetingIndex) % participantsPool.length];
    });

    const externalAttendees = Array.from({ length: externalAttendeeTarget }, (_, index) => {
      return externalStakeholders[(hourOffset + meetingIndex + index * 3) % externalStakeholders.length];
    });

    const participantDetails = [
      { name: executiveOwner, type: 'staff', company: internalCompany, isExecutive: true },
      ...staffAttendees.map((name) => ({ name, type: 'staff', company: internalCompany, isExecutive: false })),
      ...externalAttendees.map((entry) => ({ name: entry.name, type: 'external', company: entry.company, isExecutive: false })),
    ];

    const participants = participantDetails.map((entry) => entry.name);

    const potentialCounterparts = participantDetails.filter((entry) => entry.name !== executiveOwner);
    const counterpart = potentialCounterparts[(hourOffset + meetingIndex) % potentialCounterparts.length]
      ?? { name: allInternalStaff[(hourOffset + meetingIndex) % allInternalStaff.length], type: 'staff', company: internalCompany };

    const jacquesRole = ((hourOffset + meetingIndex + day) % 4 === 0) ? 'attendee' : 'host';
    const counterpartTalkativeScore = clamp(35 + ((hourOffset * 7 + meetingIndex * 11) % 64), 0, 100);
    const counterpartInquisitiveScore = clamp(28 + ((hourOffset * 5 + meetingIndex * 13 + day * 3) % 72), 0, 100);

    const meetingSizeType = participantDetails.length === 2 ? '1:1' : '1:M';
    const meetingAudienceType = getMeetingAudienceType(staffAttendees.length, externalAttendees.length);

    records.push({
      id: `MTG-${String(meetingId).padStart(5, '0')}`,
      title: `${pick(titlePrefixes, meetingId)} ${campaign}`,
      department,
      campaign,
      ownerCategory,
      ownerName,
      jacquesRole,
      counterpartName: counterpart.name,
      counterpartType: counterpart.type,
      counterpartCompany: counterpart.company,
      counterpartTalkativeScore,
      counterpartInquisitiveScore,
      meetingSizeType,
      meetingAudienceType,
      startTime: date.toISOString(),
      scheduledDurationMinutes,
      actualDurationMinutes,
      participants,
      participantDetails,
      outcome: actualDurationMinutes > scheduledDurationMinutes ? 'overtime' : actualDurationMinutes < scheduledDurationMinutes ? 'undertime' : 'on-time',
    });

    meetingId += 1;
  }
}

writeFileSync(outputPath, JSON.stringify(records, null, 2));

console.log(`Generated ${records.length} meeting records at ${outputPath}`);