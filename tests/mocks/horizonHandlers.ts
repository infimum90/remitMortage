import { http, HttpResponse } from 'msw';

const HORIZON_URL = process.env.HORIZON_URL || 'https://horizon.stellar.org';

export const horizonHandlers = [
  // Mock fetching account details
  http.get(`${HORIZON_URL}/accounts/:accountId`, ({ params }) => {
    return HttpResponse.json({
      id: params.accountId,
      account_id: params.accountId,
      sequence: '1234567890123456',
      balances: [
        {
          balance: '5000.0000000',
          asset_type: 'native',
        },
      ],
    });
  }),

  // Mock fetching payment operations history for the account
  http.get(`${HORIZON_URL}/accounts/:accountId/payments`, () => {
    return HttpResponse.json({
      _embedded: {
        records: [
          {
            id: '1122334455',
            type: 'payment',
            asset_type: 'native',
            from: 'G_EMPLOYER_MOCK_ACCOUNT',
            to: 'G_BORROWER_MOCK_ACCOUNT',
            amount: '2000.0000000',
            created_at: new Date().toISOString(),
          },
          {
            id: '1122334456',
            type: 'payment',
            asset_type: 'native',
            from: 'G_EMPLOYER_MOCK_ACCOUNT',
            to: 'G_BORROWER_MOCK_ACCOUNT',
            amount: '2000.0000000',
            created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
          }
        ],
      },
    });
  }),
];
