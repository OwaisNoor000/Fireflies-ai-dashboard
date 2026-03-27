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

const startDate = new Date();
startDate.setMinutes(0, 0, 0);
startDate.setHours(startDate.getHours() - (24 * 180));

function pick(array, indexSeed) {
  return array[indexSeed % array.length];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
    const participants = Array.from({ length: 2 + ((meetingIndex + hourOffset) % 4) }, (_, index) => {
      return participantsPool[(index + hourOffset + meetingIndex) % participantsPool.length];
    });

    records.push({
      id: `MTG-${String(meetingId).padStart(5, '0')}`,
      title: `${pick(titlePrefixes, meetingId)} ${campaign}`,
      department,
      campaign,
      startTime: date.toISOString(),
      scheduledDurationMinutes,
      actualDurationMinutes,
      participants,
      outcome: actualDurationMinutes > scheduledDurationMinutes ? 'overtime' : actualDurationMinutes < scheduledDurationMinutes ? 'undertime' : 'on-time',
    });

    meetingId += 1;
  }
}

writeFileSync(outputPath, JSON.stringify(records, null, 2));

console.log(`Generated ${records.length} meeting records at ${outputPath}`);