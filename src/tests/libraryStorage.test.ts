import { describe, it, expect, beforeEach } from 'vitest';
import { LibraryStorage, deriveDisciplineAndCategory } from '../domain/libraryStorage';
import { SolutionDocument, LibraryItem, SolutionMetadata } from '../domain/types';

describe('LibraryStorage & Discipline Categorization', () => {
  beforeEach(async () => {
    await LibraryStorage.clearAll();
  });

  describe('deriveDisciplineAndCategory', () => {
    it('fizik ve mekanik problemlerini doğru sınıflandırmalıdır', () => {
      const res1 = deriveDisciplineAndCategory(
        'Yaylı Kama Küçük Salınımları',
        'Lagrange ve Euler-Lagrange denklemleriyle genelleştirilmiş koordinatları türetiniz.'
      );
      expect(res1.discipline).toBe('fizik');
      expect(res1.category).toContain('Lagrange');
      expect(res1.tags).toContain('lagrange mekaniği');

      const res2 = deriveDisciplineAndCategory(
        'Eğik Düzlemde Blok Dinamiği',
        'Newton kuvvet analizi, sürtünme katsayısı ve ivme hesabı.'
      );
      expect(res2.discipline).toBe('fizik');
      expect(res2.tags).toContain('newton dinamigi');
    });

    it('matematik, kalkülüs ve lineer cebir problemlerini doğru sınıflandırmalıdır', () => {
      const resMath1 = deriveDisciplineAndCategory(
        'Stokes Teoremi ile Yüzey İntegrali',
        'Çok değişkenli kalkülüs, türev ve integral bağıntıları ile alan hesabı.'
      );
      expect(resMath1.discipline).toBe('matematik');
      expect(resMath1.category).toBe('Kalkülüs & Analiz');
      expect(resMath1.tags).toContain('kalkülüs');

      const resMath2 = deriveDisciplineAndCategory(
        'Matris Özdeğer Ayrışımı',
        'Karakteristik polinom, determinant ve özvektör uzayı hesabı.'
      );
      expect(resMath2.discipline).toBe('matematik');
      expect(resMath2.category).toBe('Lineer Cebir');
      expect(resMath2.tags).toContain('lineer cebir');

      const resMath3 = deriveDisciplineAndCategory(
        'Pisagor Teoremi İspatı',
        'Dik üçgende hipotenüs uzunluğu ve Öklid aksiyomları.'
      );
      expect(resMath3.discipline).toBe('matematik');
      expect(resMath3.category).toBe('Geometri & Trigonometri');
      expect(resMath3.tags).toContain('geometri');
    });
  });

  describe('LibraryStorage CRUD', () => {
    const dummyDoc: SolutionDocument = {
      id: 'doc_test_1',
      problemId: 'prob_test_1',
      problemTitle: 'Basit Sarkaç Periyodu',
      problemText: 'L boyundaki basit sarkacın periyodu',
      strategy: 'Lagrange yaklaşımı',
      assumptions: ['Küçük açılar'],
      sections: [
        {
          id: 'sec_1',
          title: 'Hareket Denklemi',
          blocks: [{ id: 'b_1', kind: 'prose', text: 'Gövde' }]
        }
      ],
      totalEquations: 1
    };

    const dummyMetadata: SolutionMetadata = {
      providerName: 'Google Gemini',
      modelName: 'gemini-3.6-flash',
      solvedAt: 1700000000000
    };

    it('createLibraryItemFromDocument ile doğru kütüphane öğesi oluşturmalıdır', () => {
      const item = LibraryStorage.createLibraryItemFromDocument(dummyDoc, [], dummyMetadata);
      expect(item.id).toBe('doc_test_1');
      expect(item.title).toBe('Basit Sarkaç Periyodu');
      expect(item.discipline).toBe('fizik');
      expect(item.createdAt).toBe(1700000000000);
      expect(item.metadata?.modelName).toBe('gemini-3.6-flash');
    });

    it('öğeleri kaydetmeli, listelemeli ve tarihe göre azalan sıralamalıdır', async () => {
      const item1: LibraryItem = {
        id: 'item_1',
        title: 'Eski Çözüm',
        problemText: 'Metin 1',
        discipline: 'fizik',
        category: 'Klasik Mekanik',
        tags: ['fizik'],
        createdAt: 1000,
        document: dummyDoc,
        layers: []
      };

      const item2: LibraryItem = {
        id: 'item_2',
        title: 'Yeni Çözüm',
        problemText: 'Metin 2',
        discipline: 'matematik',
        category: 'Kalkülüs',
        tags: ['kalkülüs'],
        createdAt: 2000,
        document: dummyDoc,
        layers: []
      };

      await LibraryStorage.saveItem(item1);
      await LibraryStorage.saveItem(item2);

      const all = await LibraryStorage.getAllItems();
      expect(all.length).toBe(2);
      expect(all[0].id).toBe('item_2'); // En yeni ilk sırada
      expect(all[1].id).toBe('item_1');
    });

    it('getItem ile tekil öğe getirebilmeli ve deleteItem ile silebilmelidir', async () => {
      const item: LibraryItem = {
        id: 'item_to_delete',
        title: 'Silinecek Çözüm',
        problemText: 'Metin',
        discipline: 'fizik',
        category: 'Klasik Mekanik',
        tags: [],
        createdAt: 1500,
        document: dummyDoc,
        layers: []
      };

      await LibraryStorage.saveItem(item);
      const fetched = await LibraryStorage.getItem('item_to_delete');
      expect(fetched).toBeDefined();
      expect(fetched?.title).toBe('Silinecek Çözüm');

      await LibraryStorage.deleteItem('item_to_delete');
      const afterDelete = await LibraryStorage.getItem('item_to_delete');
      expect(afterDelete).toBeNull();
    });
  });
});
