import {describe,it,expect} from 'vitest';
import {exportPasswordError,isProtectedProject,passwordLength,projectResponseError,projectUploadLimit} from './projectProtection';

describe('portable project protection',()=>{
 it('validates confirmation and counts Unicode characters consistently with the backend',()=>{
  expect(exportPasswordError('short','short')).toContain('8');
  expect(exportPasswordError('a long unique password','different')).toContain('match');
  expect(exportPasswordError('🔐'.repeat(12),'🔐'.repeat(12))).toBe('');
  expect(passwordLength('🔐')).toBe(1);
  expect(exportPasswordError('1234567','1234567')).toContain('8');
  expect(exportPasswordError('12345678','12345678')).toBe('');
  expect(exportPasswordError('🔐'.repeat(7),'🔐'.repeat(7))).toContain('8');
  expect(exportPasswordError('🔐'.repeat(8),'🔐'.repeat(8))).toBe('');
  expect(exportPasswordError('x'.repeat(1025),'x'.repeat(1025))).toContain('1024');
 });
 it('detects protection from the signature regardless of the filename',async()=>{
  expect(await isProtectedProject(new File(['INTERSOS\x01payload'],'renamed.zip'))).toBe(true);
  expect(await isProtectedProject(new File(['PK fake zip'],'project.intersos'))).toBe(false);
  expect(await isProtectedProject(new File(['bad'],'bad.zip'))).toBe(false);
  expect(projectUploadLimit).toBe(200*1024*1024+53);
 });
 it('preserves structured server errors for the password retry flow',()=>{
  const error=projectResponseError({code:'password_required',message:'Enter password'},'Failed');
  expect(error.code).toBe('password_required');expect(error.message).toBe('Enter password');
  expect(projectResponseError('Existing ZIP error','Failed').message).toBe('Existing ZIP error');
 });
});
