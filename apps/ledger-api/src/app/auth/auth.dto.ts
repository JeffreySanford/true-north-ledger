import {
  AuthResponseSchema,
  AuthUserSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
  ServiceTokenCreateRequestSchema,
  ServiceTokenCreateResponseSchema,
  ServiceTokenRevokeRequestSchema,
  UserDeactivationRequestSchema,
  UserDeactivationResponseSchema,
  UserRoleAssignmentRequestSchema,
  UserRoleAssignmentResponseSchema,
  JwtPayloadSchema,
  type AuthResponse as AuthContractsResponse,
  type AuthUser as AuthContractsUser,
  type JwtPayload as AuthContractsJwtPayload,
  type LoginRequest as AuthContractsLoginRequest,
  type LogoutRequest as AuthContractsLogoutRequest,
  type RefreshRequest as AuthContractsRefreshRequest,
  type ServiceTokenCreateRequest as AuthContractsServiceTokenCreateRequest,
  type ServiceTokenCreateResponse as AuthContractsServiceTokenCreateResponse,
  type ServiceTokenRevokeRequest as AuthContractsServiceTokenRevokeRequest,
  type UserDeactivationRequest as AuthContractsUserDeactivationRequest,
  type UserDeactivationResponse as AuthContractsUserDeactivationResponse,
  type UserRoleAssignmentRequest as AuthContractsUserRoleAssignmentRequest,
  type UserRoleAssignmentResponse as AuthContractsUserRoleAssignmentResponse,
} from '@true-north-ledger/auth-contracts';

export {
  AuthResponseSchema,
  AuthUserSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
  ServiceTokenCreateRequestSchema,
  ServiceTokenCreateResponseSchema,
  ServiceTokenRevokeRequestSchema,
  UserDeactivationRequestSchema,
  UserDeactivationResponseSchema,
  UserRoleAssignmentRequestSchema,
  UserRoleAssignmentResponseSchema,
  JwtPayloadSchema,
};

export type LoginRequest = AuthContractsLoginRequest;
export type RefreshRequest = AuthContractsRefreshRequest;
export type LogoutRequest = AuthContractsLogoutRequest;
export type AuthUser = AuthContractsUser;
export type AuthResponse = AuthContractsResponse;
export type ServiceTokenCreateRequest = AuthContractsServiceTokenCreateRequest;
export type ServiceTokenCreateResponse = AuthContractsServiceTokenCreateResponse;
export type ServiceTokenRevokeRequest = AuthContractsServiceTokenRevokeRequest;
export type UserRoleAssignmentRequest = AuthContractsUserRoleAssignmentRequest;
export type UserRoleAssignmentResponse = AuthContractsUserRoleAssignmentResponse;
export type UserDeactivationRequest = AuthContractsUserDeactivationRequest;
export type UserDeactivationResponse = AuthContractsUserDeactivationResponse;
export type JwtPayload = AuthContractsJwtPayload;
