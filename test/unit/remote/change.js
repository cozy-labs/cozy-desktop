/* eslint-env mocha */

const remoteChange = require('../../../core/remote/change')

describe('remote change sort', () => {
  it('sort correctly move inside move', () => {
    const parent = {
      doc: { path: 'parent/dst/dir' },
      type: 'DirMove',
      was: { path: 'parent/src/dir' }
    }
    const child = {
      doc: { path: 'parent/dst/dir/subdir/filerenamed' },
      type: 'FileMove',
      was: { path: 'parent/dst/dir/subdir/file' }
    }
    const a = [child, parent]
    remoteChange.sort(a)
    a.should.deepEqual([parent, child])
  })

  describe('sorts deleted before created for the same path', () => {
    const deleted = {
      doc: { path: 'parent/file' },
      type: 'FileDeletion'
    }

    const created = {
      doc: { path: 'parent/file' },
      type: 'FileAddition'
    }

    it('when deleted comes before created', () => {
      const changes = [deleted, created]
      remoteChange.sort(changes)
      changes.should.deepEqual([deleted, created])
    })

    it('when created comes before deleted', () => {
      const changes = [created, deleted]
      remoteChange.sort(changes)
      changes.should.deepEqual([deleted, created])
    })

    it('even with other changes', () => {
      const netflixBillAddition = {
        doc: {
          path: 'Administratif/Netflix/email_2/2019-05-06_12,34.pdf'
        },
        was: null,
        type: 'FileAddition'
      }
      const edfContract1ConflictCreation = {
        doc: {
          path:
            'Administratif/EDF/email_1/Address 1/attestation de contrat-conflict-2019-05-06T12_34_56.012Z.pdf'
        },
        was: {
          path: 'Administratif/EDF/email_1/Address 1/attestation de contrat.pdf'
        },
        type: 'FileMove'
      }
      const edfContract2ConflictCreation = {
        doc: {
          path:
            'Administratif/EDF/email_1/Address 3/attestation de contrat-conflict-2019-05-06T12_34_56.345Z.pdf'
        },
        was: {
          path: 'Administratif/EDF/email_1/Address 3/attestation de contrat.pdf'
        },
        type: 'FileMove'
      }
      const edfContract3Deletion = {
        doc: {
          path: 'Administratif/EDF/email_2/Address 2/attestation de contrat.pdf'
        },
        was: {
          path: 'Administratif/EDF/email_2/Address 2/attestation de contrat.pdf'
        },
        type: 'FileDeletion'
      }
      const edfContract3Addition = {
        doc: {
          path: 'Administratif/EDF/email_2/Address 2/attestation de contrat.pdf'
        },
        was: null,
        type: 'FileAddition'
      }
      const edfContract2Addition = {
        doc: {
          path: 'Administratif/EDF/email_1/Address 3/attestation de contrat.pdf'
        },
        was: null,
        type: 'FileAddition'
      }
      const edfContract1Addition = {
        doc: {
          path: 'Administratif/EDF/email_1/Address 1/attestation de contrat.pdf'
        },
        was: null,
        type: 'FileAddition'
      }
      const digipostBouyguesBill = {
        doc: {
          path:
            'Administratif/Digiposte/email_2/Bouygues Telecom - Factures/Facture_2019-05-06.pdf'
        },
        was: null,
        type: 'FileAddition'
      }
      const alanInsuranceCardDeletion = {
        doc: {
          path: 'Administratif/Alan/email_2/Carte_Mutuelle.pdf'
        },
        was: {
          path: 'Administratif/Alan/email_2/Carte_Mutuelle.pdf'
        },
        type: 'FileDeletion'
      }
      const alanInsuranceCardAddition = {
        doc: {
          path: 'Administratif/Alan/email_2/Carte_Mutuelle.pdf'
        },
        was: null,
        type: 'FileAddition'
      }
      const photoAddition = {
        doc: {
          path: 'Photos/Sauvegardées depuis mon mobile/20190506_123456.jpg'
        },
        was: null,
        type: 'FileAddition'
      }

      const changes = [
        netflixBillAddition,
        edfContract1ConflictCreation,
        edfContract2ConflictCreation,
        edfContract3Deletion,
        edfContract3Addition,
        edfContract2Addition,
        edfContract1Addition,
        digipostBouyguesBill,
        alanInsuranceCardDeletion,
        alanInsuranceCardAddition,
        photoAddition
      ]
      remoteChange.sort(changes)

      // Sort order:
      // - alphabetical order
      // - conflicts before anything else on same id
      // - deletion before addition on same id
      changes.should.deepEqual([
        edfContract3Deletion,
        digipostBouyguesBill,
        edfContract1ConflictCreation,
        edfContract1Addition,
        edfContract2ConflictCreation,
        edfContract2Addition,
        edfContract3Addition,
        alanInsuranceCardDeletion,
        alanInsuranceCardAddition,
        netflixBillAddition,
        photoAddition
      ])
    })
  })
})
