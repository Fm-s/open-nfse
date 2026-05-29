#!/usr/bin/env bash
# Baixa toda a documentação técnica oficial da NFS-e Padrão Nacional
# a partir de https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica
# Organiza em specs/oficial/<secao>/ espelhando a estrutura do site.
set -u

BASE="https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica"
ROOT="$(cd "$(dirname "$0")/.." && pwd)/specs/oficial"

FAIL=0
OK=0

# uso: dl <subpasta> <url> [nome-arquivo-destino]
dl() {
  local sub="$1" url="$2" name="${3:-}"
  local dir="$ROOT/$sub"
  mkdir -p "$dir"
  if [[ -z "$name" ]]; then
    name="$(basename "${url%/view}")"
    name="$(python3 -c "import sys,urllib.parse;print(urllib.parse.unquote(sys.argv[1]))" "$name")"
  fi
  local out="$dir/$name"
  if curl -fsSL --retry 3 --retry-delay 2 -A "Mozilla/5.0" "$url" -o "$out"; then
    printf '  ok   %s\n' "$sub/$name"
    OK=$((OK+1))
  else
    printf '  FAIL %s  <- %s\n' "$sub/$name" "$url"
    rm -f "$out"
    FAIL=$((FAIL+1))
  fi
}

echo "== documentacao-atual =="
dl documentacao-atual "$BASE/documentacao-atual/guia-emissorpubliconacionalweb_snnfse-ern-v12.pdf"
dl documentacao-atual "$BASE/documentacao-atual/guia-do-painel-administrativo-municipal-nfs-e-v1-2-out2025.pdf"
dl documentacao-atual "$BASE/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf"
dl documentacao-atual "$BASE/documentacao-atual/manual-municipios-apis-adn-sistema-nacional-nfs-e-v1-2-out21025.pdf"
dl documentacao-atual "$BASE/documentacao-atual/manual-municipios-cnc-api-sistema-nacional-nfs-e-v1-2-out21025.pdf"
dl documentacao-atual "$BASE/documentacao-atual/manual-municipios-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out21025.pdf"
dl documentacao-atual "$BASE/documentacao-atual/manual-contribuintes-apis-adn-sistema-nacional-nfse.pdf"
dl documentacao-atual "$BASE/documentacao-atual/manual-contribuintes-emissor-publico-api-emissao-decisao-administrativa-e-judicial.pdf"
dl documentacao-atual "$BASE/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip"
dl documentacao-atual "$BASE/documentacao-atual/anexo_a-municipio_ibge-paises_iso2-v1-00-snnfse-20251210.xlsx"
dl documentacao-atual "$BASE/documentacao-atual/anexo_b-nbs2-lista_servico_nacional-snnfse-v1-01-20260122.xlsx"
dl documentacao-atual "$BASE/documentacao-atual/anexo_c-indop_ibscbs-snnfse-v1-01-20260122.xlsx"
dl documentacao-atual "$BASE/documentacao-atual/anexo_i-sefin_adn-dps_nfse-snnfse-v1-01-20260209.xlsx"
dl documentacao-atual "$BASE/documentacao-atual/anexo_ii-sefin_adn-pedregevt_evt-snnfse-v1-01-20260122.xlsx"
dl documentacao-atual "$BASE/documentacao-atual/anexo_iii-cnc-snnfse-v1-00-20251216.xlsx"
dl documentacao-atual "$BASE/documentacao-atual/anexo_iv-adn-snnfse-v1-00-20251216.xlsx"
dl documentacao-atual "$BASE/documentacao-atual/anexo_v-painel_adm_municipal-snnfse-v1-00-20251216.xlsx"

echo "== producao-restrita =="
dl producao-restrita "$BASE/producao-restrita/guia-utilizacao-do-man-v1-00-08abr2026.pdf"
dl producao-restrita "$BASE/producao-restrita/nt-004-se-cgnfse-novo-layout-rtc-v2-00-20251210.pdf"
dl producao-restrita "$BASE/producao-restrita/anexo_i-sefin_adn-dps_nfse-snnfse-prodrest-v1-01-20260209.xlsx"
dl producao-restrita "$BASE/producao-restrita/anexo_ii-sefin_adn-pedregevt_evt-snnfse-prodrest-v1-01-202601122.xlsx"
dl producao-restrita "$BASE/producao-restrita/anexo_b-nbs2-lista_servico_nacional-snnfse-prodrest-v1-01-20260122.xlsx"
dl producao-restrita "$BASE/producao-restrita/anexo_c-indop_ibscbs-snnfse-prodrest-v1-01-20260122.xlsx"
dl producao-restrita "$BASE/producao-restrita/nfse-esquemas_xsd-prodrest-v1-01-20260209.zip"
dl producao-restrita "$BASE/producao-restrita/nfse-esquemas_xsd-rtc-v1-00-20251210.zip"
dl producao-restrita "$BASE/producao-restrita/anexovi-leiautesrn_rtc_ibscbs-v1-01-03-nt004.xlsx"

echo "== rtc =="
dl rtc "$BASE/rtc/nt-008-se-cgnfse-danfse-20260505.pdf"
dl rtc "$BASE/rtc/nt-007-se-cgnfse-v1-0.pdf"
dl rtc "$BASE/rtc/nt-006-se-cgnfse-leiaute-nfse-via.pdf"
dl rtc "$BASE/rtc/nt-005-se-cgnfse-novo-layout-rtc.pdf"
dl rtc "$BASE/rtc/nt-003-1-2-se-cgnfse-novo-layout-rtc.pdf"
dl rtc "$BASE/rtc/nota-tecnica-001-se-cgnfse-novo-layout-rtc.pdf"
dl rtc "$BASE/rtc/anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-01-00.xlsx"
dl rtc "$BASE/rtc/anexovi-leiautesrn_rtc_ibscbs-v1-03-00-2013-nt007.xlsx"
dl rtc "$BASE/rtc/anexovii-indop_ibscbs_v1-01-00.xlsx"
dl rtc "$BASE/rtc/anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-00-00.xlsx"
dl rtc "$BASE/rtc/anexovi-leiautesrn_rtc_ibscbs-v1-02-00.xlsx"
dl rtc "$BASE/rtc/anexovii-indop_ibscbs_v1-00-00.xlsx"

echo "== leiaute-e-esquemas-antigos =="
dl leiaute-e-esquemas-antigos "$BASE/leiaute-e-esquemas-antigos/manualintegradosnnfse_v1-00-02-producao.pdf"
dl leiaute-e-esquemas-antigos "$BASE/leiaute-e-esquemas-antigos/manual-portal-municipal-nfs-e-v11-1.pdf"
dl leiaute-e-esquemas-antigos "$BASE/leiaute-e-esquemas-antigos/anexoiv-leiautesrn_adn-snnfse_v1-00-02-producao.xlsx"
dl leiaute-e-esquemas-antigos "$BASE/leiaute-e-esquemas-antigos/xsd_pl_nfse_1-00-producao.zip"
dl leiaute-e-esquemas-antigos "$BASE/leiaute-e-esquemas-antigos/manual-portal-municipal-nfs-e-v11.pdf"

echo "== logos-da-nfs-e =="
dl logos-da-nfs-e "$BASE/logos-da-nfs-e/Logo%20-%20NFS-e%20-%20Vertical.png" "Logo - NFS-e - Vertical.png"
dl logos-da-nfs-e "$BASE/logos-da-nfs-e/Logo%20-%20NFS-e%20-%20Horizontal.png" "Logo - NFS-e - Horizontal.png"

echo
echo "== resumo: $OK baixados, $FAIL falhas =="
exit $FAIL
