export interface ExpiredHoldRepository {
  expireDueHolds(input: { readonly now: Date; readonly requestId: string }): Promise<number>;
}
