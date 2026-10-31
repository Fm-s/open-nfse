/**
 * Pré-validação da chave de acesso de 50 posições nas leituras (`fetchByChave`,
 * `consultarDanfse`, `NfseClientFake`). Aceita as duas formas dos XSDs
 * oficiais (bundle RTC v1.01-20260727, idênticas no nt009), que divergem sobre
 * onde fica o CNPJ alfanumérico:
 *
 * - `TSChaveNFSe`: `[0-9]{6}[0-9A-Z]{14}[0-9]{30}` — alfanumérico nas posições 7–20;
 * - `TSIdNFSe` sem o "NFS" (e `TSIdPedRegEvt`): `[0-9]{9}[0-9A-Z]{14}[0-9]{27}` —
 *   a regra de formação real (Cód.Mun.(7) + Amb.Ger.(1) + Tipo Insc.(1) +
 *   Inscrição(14) + …), alfanumérico nas posições 10–23.
 *
 * Uma chave real de CNPJ alfanumérico com letra no 12º caractere do CNPJ só
 * casa com a segunda forma; rejeitá-la localmente impediria ler uma NFS-e
 * existente. Onde o XSD exige `TSChaveNFSe` num campo enviado (ex.:
 * `subst/chSubstda`), o guard correspondente continua espelhando o XSD.
 */
export const REGEX_CHAVE_ACESSO =
  /^(?:[0-9]{6}[0-9A-Z]{14}[0-9]{30}|[0-9]{9}[0-9A-Z]{14}[0-9]{27})$/;
