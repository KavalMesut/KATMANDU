import { beforeEach } from 'vitest';
import { setLanguage } from '../i18n';

// Existing regression scenarios explicitly exercise the secondary Turkish locale.
// English defaults and language switching are covered in localization.test.tsx.
beforeEach(() => { setLanguage('tr'); });
