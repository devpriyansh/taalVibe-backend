const mockClient = {
  on: () => {},
  subscribe: () => {},
  status: 'ready',
  isReady: true,
  get: async () => null,
  set: async () => 'OK',
}

export default {
  connection: {},
  publisherClient: mockClient,
  subscriberClient: mockClient,
  client: mockClient
}
