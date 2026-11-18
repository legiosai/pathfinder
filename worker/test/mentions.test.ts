import { describe, expect, it } from 'vitest';
import { buildMentions } from '../src/mentions';

const cert = (id: string, name: string, code: string, provider: string) => ({ id, name, code, provider });
const certs = [
  cert('aws-clf-c02', 'AWS Certified Cloud Practitioner', 'CLF-C02', 'AWS'),
  cert('aws-aif-c01', 'AI Practitioner', 'AIF-C01', 'AWS'),
  cert('microsoft-az-900', 'Microsoft Azure Fundamentals', 'AZ-900', 'Microsoft'),
  cert('comptia-security-plus', 'CompTIA Security+', 'SY0-801', 'CompTIA'),
  cert('comptia-cysa-plus', 'CompTIA Cybersecurity Analyst (CySA+)', 'CS0-004', 'CompTIA'),
  cert('offsec-oscp', 'OffSec Certified Professional', 'OSCP+ / PEN-200', 'OffSec'),
  cert('isc2-cc', 'Certified in Cybersecurity', 'CC', 'ISC2'),
  cert('google-cloud-engineer', 'Google Cloud Associate Cloud Engineer', 'ACE', 'Google Cloud'),
  cert('nvidia-nca-genl', 'Generative AI LLMs', 'NCA-GENL', 'NVIDIA'),
  cert('nvidia-ncp-genl', 'Generative AI LLMs', 'NCP-GENL', 'NVIDIA'),
  cert('nvidia-ncp-aai', 'Agentic AI', 'NCP-AAI', 'NVIDIA'),
  cert('ine-ejpt', 'Junior Penetration Tester', 'eJPT', 'INE'),
];
const find = buildMentions(certs);

describe('mentions', () => {
  it('finds certifications by code and by name, in order of first mention', () => {
    expect(find('Arrancá por AZ-900 o AWS Cloud Practitioner; después Security+ y el OSCP.')).toEqual([
      'microsoft-az-900',
      'aws-clf-c02',
      'comptia-security-plus',
      'offsec-oscp',
    ]);
    expect(find('The eJPT first, then PEN-200 and CySA+ (CS0-004).')).toEqual(['ine-ejpt', 'offsec-oscp', 'comptia-cysa-plus']);
    expect(find('AWS AI Practitioner (AIF-C01) is cheap; az 900 too.')).toEqual(['aws-aif-c01', 'microsoft-az-900']);
  });

  it('counts each certification once', () => {
    expect(find('Cloud Practitioner, CLF-C02, AWS Certified Cloud Practitioner')).toEqual(['aws-clf-c02']);
  });

  it('ignores prose, shared names, short and ambiguous codes', () => {
    expect(find('An AI practitioner uses agentic AI and generative AI.')).toEqual([]);
    expect(find('Agentic AI is everywhere; so are Generative AI LLMs.')).toEqual([]);
    expect(find('CC me on that; ACE the exam; NCA-GENL is the associate one.')).toEqual(['nvidia-nca-genl']);
    expect(find('AZ-9000 and XAZ-900 are not codes here')).toEqual([]);
    expect(find('')).toEqual([]);
  });
});
