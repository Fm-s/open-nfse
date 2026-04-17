// AUTO-GENERATED from schemas/rtc-v1.01/*.xsd by scripts/generate-schemas.mjs.
// Do not edit by hand. Regenerate when a new Nota Técnica updates the XSDs.

export interface RtcSchemaFile {
  readonly fileName: string;
  readonly contents: string;
}

export const RTC_V1_01_SCHEMAS: readonly RtcSchemaFile[] = [
  {
    fileName: "CNC_v1.00.xsd",
    contents: `﻿<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           targetNamespace="http://www.sped.fazenda.gov.br/nfse"
           xmlns="http://www.sped.fazenda.gov.br/nfse"
           attributeFormDefault="unqualified"
           elementFormDefault="qualified">
  <xs:import namespace="http://www.w3.org/2000/09/xmldsig#" schemaLocation="xmldsig-core-schema.xsd"/>
  <xs:include schemaLocation="tiposCnc_v1.00.xsd"/>
  <xs:element name="CNC" type="TCNC">
    <xs:annotation>
      <xs:documentation>Schema XML Leiaute do arquivo para upload - CNC</xs:documentation>
    </xs:annotation>
  </xs:element>
</xs:schema>
`,
  },
  {
    fileName: "DPS_v1.01.xsd",
    contents: `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           targetNamespace="http://www.sped.fazenda.gov.br/nfse"
           xmlns="http://www.sped.fazenda.gov.br/nfse"
           attributeFormDefault="unqualified"
           elementFormDefault="qualified">
  <xs:import namespace="http://www.w3.org/2000/09/xmldsig#" schemaLocation="xmldsig-core-schema.xsd"/>
  <xs:include schemaLocation="tiposComplexos_v1.01.xsd"/>
  <xs:element name="DPS" type="TCDPS">
    <xs:annotation>
      <xs:documentation>Schema XML da Declaração de Prestação de Serviços - DPS</xs:documentation>
    </xs:annotation>
  </xs:element>  
</xs:schema>`,
  },
  {
    fileName: "NFSe_v1.01.xsd",
    contents: `<?xml version="1.0" encoding="UTF-8"?>
<!-- PL_NFSE_NT04_RTCv101 - Alterações dos esquemas decorrentes da Nota Técnica SE/CGNFS-e nº 004, de 19 de agosto de 2025 -->
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" 
           xmlns:ds="http://www.w3.org/2000/09/xmldsig#" 
           targetNamespace="http://www.sped.fazenda.gov.br/nfse" 
           xmlns="http://www.sped.fazenda.gov.br/nfse" 
           attributeFormDefault="unqualified" 
           elementFormDefault="qualified">
  <xs:import namespace="http://www.w3.org/2000/09/xmldsig#" schemaLocation="xmldsig-core-schema.xsd"/>
  <xs:include schemaLocation="tiposComplexos_v1.01.xsd"/>
  <xs:element name="NFSe" type="TCNFSe">
    <xs:annotation>
      <xs:documentation>Schema XML da Nota Fiscal de Serviços Eletrônica - NFS-e</xs:documentation>
    </xs:annotation>
  </xs:element>
</xs:schema>`,
  },
  {
    fileName: "evento_v1.01.xsd",
    contents: `﻿<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
           targetNamespace="http://www.sped.fazenda.gov.br/nfse"
           xmlns="http://www.sped.fazenda.gov.br/nfse"
           attributeFormDefault="unqualified"
           elementFormDefault="qualified">
  <xs:import namespace="http://www.w3.org/2000/09/xmldsig#" schemaLocation="xmldsig-core-schema.xsd"/>
  <xs:include schemaLocation="tiposEventos_v1.01.xsd"/>
  <xs:element name="evento" type="TCEvento">
    <xs:annotation>
      <xs:documentation>Schema XML do Pedido de Registro de Eventos</xs:documentation>
    </xs:annotation>
  </xs:element>
</xs:schema>`,
  },
  {
    fileName: "pedRegEvento_v1.01.xsd",
    contents: `﻿<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
           targetNamespace="http://www.sped.fazenda.gov.br/nfse"
           xmlns="http://www.sped.fazenda.gov.br/nfse"
           attributeFormDefault="unqualified"
           elementFormDefault="qualified">
  <xs:import namespace="http://www.w3.org/2000/09/xmldsig#" schemaLocation="xmldsig-core-schema.xsd"/>
  <xs:include schemaLocation="tiposEventos_v1.01.xsd"/>
  <xs:element name="pedRegEvento" type="TCPedRegEvt">
    <xs:annotation>
      <xs:documentation>Schema XML do Pedido de Registro de Eventos</xs:documentation>
    </xs:annotation>
  </xs:element>
</xs:schema>`,
  },
  {
    fileName: "tiposCnc_v1.00.xsd",
    contents: `﻿<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
           targetNamespace="http://www.sped.fazenda.gov.br/nfse"
           xmlns="http://www.sped.fazenda.gov.br/nfse"
           attributeFormDefault="unqualified"
           elementFormDefault="qualified">
  <xs:import namespace="http://www.w3.org/2000/09/xmldsig#" schemaLocation="xmldsig-core-schema.xsd"/>
  <xs:include schemaLocation="tiposComplexos_v1.01.xsd"/>
  <xs:include schemaLocation="tiposSimples_v1.01.xsd"/>
  <!--TIPO COMPLEXO PARA ENDEREÇO UPLOAD DE CONTRIBUINTES -->
  <xs:complexType name="TCEnderContribuinteCNC">
    <xs:sequence>
      <xs:element name="CEP" type="TSCEP">
        <xs:annotation>
          <xs:documentation>Código de endereçamento postal do estabelecimento do contribuinte</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nro" type="TSNumeroEndereco">
        <xs:annotation>
          <xs:documentation>Número do estabelecimento no logradouro informado</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xCpl" type="TSComplementoEndereco" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Informação complementar para identificação do endereço do contribuinte</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA UPLOAD DE CONTRIBUINTES DO CNC -->
  <xs:complexType name="TCNC">
    <xs:sequence>
      <xs:element name="infCNC" type="TCInfCNC"/>
    </xs:sequence>
    <xs:attribute name="versao" type="TVerCNC" use="required"/>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DO UPLOAD DE CONTRIBUINTES DO CNC -->
  <xs:complexType name="TCInfCNC">
    <xs:sequence>
      <xs:element name="tpAmb" type="TSTipoAmbiente">
        <xs:annotation>
          <xs:documentation>Identificação do Ambiente: 1 - Produção; 2 - Homologação</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="dhGeracaoArquivo" type="TSDateTimeUTC">
        <xs:annotation>
          <xs:documentation>Data e hora da geração do arquivo CNC. Data e hora no formato UTC (Universal Coordinated Time): AAAA-MM-DDThh:mm:ssTZD</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="verAplic" type="TSVerAplic">
        <xs:annotation>
          <xs:documentation>Versão do aplicativo que gerou Informações para cadastramento de novos contribuintes CNC</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="contribuintesCnc">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="contribuinteCnc" type="TCInfoContribuinteCNC" maxOccurs="unbounded">
              <xs:annotation>
                <xs:documentation>Grupo de informações cadastramento de novos contribuintes CNC</xs:documentation>
              </xs:annotation>
            </xs:element>
          </xs:sequence>
        </xs:complexType>
      </xs:element>      
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE UMA PESSOA MANTIDA PELO  CADASTRO DO CNC (CNPJ,CPF)-->
  <xs:complexType name="TCInfoContribuinteCNC">
    <xs:annotation>
      <xs:documentation>Informações para cadastramento de novos contribuintes CNC </xs:documentation>
    </xs:annotation>
    <xs:sequence>
      <xs:choice>
        <xs:element name="CNPJ" type="TSCNPJ">
          <xs:annotation>
            <xs:documentation>Número do CNPJ</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="CPF" type="TSCPF">
          <xs:annotation>
            <xs:documentation>Número do CPF</xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
      <xs:element name="IM" type="TSInscMun" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Número da inscrição municipal</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="dInscricaoMunicipal" type="TSData">
        <xs:annotation>
          <xs:documentation> Data da Inscrição Municipal: Dia, mês e ano (AAAAMMDD)</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="enderContribuinteCNC" type="TCEnderContribuinteCNC">
        <xs:annotation>
          <xs:documentation>Grupo de informações do endereço do contribuinte do CNC</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="fone" type="TSTelefone" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Número do telefone do prestador:
            Preencher com o Código DDD + número do telefone.
            Nas operações com exterior é permitido informar o código do país + código da localidade + número do telefone)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="email" type="TSEmail" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Endereço de e-mail para contato com o contribuinte</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="regEspTribContribuinteCNC" type="TSRegEspTrib">
        <xs:annotation>
          <xs:documentation>
            Tipos de Regimes Especiais de Tributação:
            0 - Nenhum;
            1 - Ato Cooperado (Cooperativa);
            2 - Estimativa;
            3 - Microempresa Municipal;
            4 - Notário ou Registrador;
            5 - Profissional Autônomo;
            6 - Sociedade de Profissionais;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="situacaoCadastroContribuinte" type="TSSituacaoCadastroContribuinte" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Identificação da situação do cadastro do contribuinte
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="motivoSituacaoCadastroContribuinte" type="TSMotivoSituacaoCadastroContribuinte" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Motivo pelo qual o contribuinte se enquadra na situação informada
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="situacaoEmissaoNFSE" type="TSSituacaoEmissaoNFSE">
        <xs:annotation>
          <xs:documentation>
            Situação Emissão NFS-e:
            0 - Não Habilitado;
            1 - Habilitado;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`,
  },
  {
    fileName: "tiposComplexos_v1.01.xsd",
    contents: `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema attributeFormDefault="unqualified" elementFormDefault="qualified" targetNamespace="http://www.sped.fazenda.gov.br/nfse" xmlns="http://www.sped.fazenda.gov.br/nfse" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:import namespace="http://www.w3.org/2000/09/xmldsig#" schemaLocation="xmldsig-core-schema.xsd"/>
  <xs:include schemaLocation="tiposSimples_v1.01.xsd"/>
  <!--TIPO COMPLEXO NFS-e-->
  <xs:complexType name="TCNFSe">
    <xs:sequence>
      <xs:element name="infNFSe" type="TCInfNFSe"/>
      <xs:element ref="ds:Signature"/>
    </xs:sequence>
    <xs:attribute name="versao" type="TVerNFSe" use="required"/>
  </xs:complexType>
  <!--GRUPO DE INFORMAÇÕES DA NFS-e-->
  <xs:complexType name="TCInfNFSe">
    <xs:sequence>
      <xs:element name="xLocEmi" type="TSDesc150">
        <xs:annotation>
          <xs:documentation>Descrição do código do IBGE do município emissor da NFS-e.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xLocPrestacao" type="TSDesc150">
        <xs:annotation>
          <xs:documentation>Descrição do local da prestação do serviço.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nNFSe" type="TSNNFSe">
        <xs:annotation>
          <xs:documentation>Número sequencial por tipo de emitente da NFS-e.
            A Sefin Nacional NFS-e irá gerar o número da NFS-e de forma sequencial por emitente. Por se tratar de um ambiente altamente transacional, a Sefin Nacional NFS-e não irá reutilizar números inutilizados durante a geração da NFS-e.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cLocIncid" type="TSCodMunIBGE" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            O código de município utilizado pelo Sistema Nacional NFS-e é o código definido para cada município pertencente ao ""Anexo V – Tabela de Código de Municípios do IBGE"", que consta ao final do Manual de Orientação ao Contribuinte do ISSQN para a Sefin Nacional NFS-e.
            O município de incidência do ISSQN é determinado automaticamente pelo sistema, conforme regras do aspecto espacial da lei complementar federal (LC 116/03) que são válidas para todos  os municípios.
            http://www.planalto.gov.br/ccivil_03/Leis/LCP/Lcp116.htm
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xLocIncid" type="TSDesc150" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            A descrição do código de município utilizado pelo Sistema Nacional NFS-e é o nome de cada município pertencente ao "Anexo V – Tabela de Código de Municípios do IBGE", que consta ao final do Manual de Orientação ao Contribuinte do ISSQN para a Sefin Nacional NFS-e.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xTribNac" type="TSDesc600">
        <xs:annotation>
          <xs:documentation>
            Descrição do código de tributação nacional do ISSQN.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xTribMun" type="TSDesc600" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Descrição do código de tributação municipal do ISSQN.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xNBS" type="TSDesc600" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Descrição do código da NBS.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="verAplic" type="TSVerAplic">
        <xs:annotation>
          <xs:documentation>Versão do aplicativo que gerou a NFS-e</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="ambGer" type="TSAmbGeradorNFSe">
        <xs:annotation>
          <xs:documentation>Ambiente gerador da NFS-e</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="tpEmis" type="TSTipoEmissao">
        <xs:annotation>
          <xs:documentation>
            Processo de Emissão da DPS:
            1 - Emissão com aplicativo do contribuinte (via Web Service);
            2 - Emissão com aplicativo disponibilizado pelo fisco (Web);
            3 - Emissão com aplicativo disponibilizado pelo fisco (App);
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="procEmi" type="TSProcEmissao" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Processo de Emissão da DPS:
            1 - Emissão com aplicativo do contribuinte (via Web Service);
            2 - Emissão com aplicativo disponibilizado pelo fisco (Web);
            3 - Emissão com aplicativo disponibilizado pelo fisco (App);
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cStat" type="TStat">
        <xs:annotation>
          <xs:documentation>Código do Status da mensagem</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="dhProc" type="TSDateTimeUTC">
        <xs:annotation>
          <xs:documentation>
            Data/Hora da validação da DPS e geração da NFS-e. Data e hora no formato UTC (Universal Coordinated Time):AAAA-MM-DDThh:mm:ssTZD
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nDFSe" type="TSNDFSe">
        <xs:annotation>
          <xs:documentation>
            Número sequencial do documento gerado por ambiente gerador de DFSe do múnicípio.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="emit" type="TCEmitente">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações da DPS relativas ao emitente da NFS-e
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="valores" type="TCValoresNFSe">
        <xs:annotation>
          <xs:documentation>Grupo de valores referentes ao Serviço Prestado</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="IBSCBS" type="TCRTCIBSCBS" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações geradas pelo sistema referentes ao IBS e à CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="DPS" type="TCDPS">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações da DPS relativas ao serviço prestado
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
    <xs:attribute name="Id" type="TSIdNFSe" use="required"/>
  </xs:complexType>
  <!--TIPO COMPLEXO DO EMITENTE DA NFS-e-->
  <xs:complexType name="TCEmitente">
    <xs:sequence>
      <xs:choice>
        <xs:element name="CNPJ" type="TSCNPJ">
          <xs:annotation>
            <xs:documentation>
              Número do CNPJ do emitente da NFS-e.
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="CPF" type="TSCPF">
          <xs:annotation>
            <xs:documentation>
              Número do CPF do emitente da NFS-e.
            </xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
      <xs:element name="IM" type="TSInscMun" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Número da inscrição municipal</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xNome" type="TSNomeRazaoSocial">
        <xs:annotation>
          <xs:documentation>
            Nome / Razão Social do emitente.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xFant" type="TSNomeFantasia" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Nome / Fantasia do emitente.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="enderNac" type="TCEnderecoEmitente">
        <xs:annotation>
          <xs:documentation>Grupo de informações do endereço nacional do Emitente da NFS-e</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="fone" type="TSTelefone" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Número do telefone do emitente.
            (Preencher com o Código DDD + número do telefone.
            Nas operações com exterior é permitido informar o código do país + código da localidade + número do telefone)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="email" type="TSEmail" minOccurs="0">
        <xs:annotation>
          <xs:documentation>E-mail do emitente.</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO DOS VALORES DA NFS-e-->
  <xs:complexType name="TCValoresNFSe">
    <xs:sequence>
      <xs:element name="vCalcDR" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor monetário (R$) de dedução/redução da base de cálculo (BC) do ISSQN.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="tpBM" type="TBMISSQN" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Tipo Benefício Municipal (BM):

            1) Isenção;
            2) Redução da BC em 'ppBM' %;
            3) Redução da BC em R$ 'vInfoBM';
            4) Alíquota Diferenciada de 'aliqDifBM' %;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vCalcBM" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor monetário (R$) do percentual de redução da base de cálculo (BC) do ISSQN devido a um benefício municipal (BM).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vBC" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor da Base de Cálculo do ISSQN (R$) = Valor do Serviço - Desconto Incondicionado - Deduções/Reduções - Benefício Municipal
            vBC = vServ - descIncond - (vDR ou vCalcDR + vCalcReeRepRes) - (vRedBCBM ou VCalcBM)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pAliqAplic" type="TSDec1V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Alíquota aplicada sobre a base de cálculo para apuração do ISSQN.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vISSQN" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor do ISSQN (R$) = Valor da Base de Cálculo x Alíquota ISSQN = vBC x pAliqAplic
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vTotalRet" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor total de retenções = Σ(CP + IRRF + CSLL  + ISSQN* +  (PIS + COFINS)**)
            vTotalRet (R$) = (vRetCP + vRetIRRF + vRetCSLL) + vISSQN* + (vPIS + vCOFINS)**
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vLiq" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor líquido = Valor do serviço - Desconto condicionado - Desconto incondicionado - Valores retidos (CP, IRRF, CSLL)* - Valores, se retidos (ISSQN, PIS, COFINS)**
            Valor Líquido (R$) = vServ – vDescIncond – vDescCond – (vRetCP + vRetIRRF + vRetCSLL)* – (vISSQN - vPIS + vCOFINS)**
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xOutInf" type="TSDesc2000" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Uso da Administração Tributária Municipal.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO IBSCBS-->
  <xs:complexType name="TCRTCIBSCBS">
    <xs:sequence>
      <xs:element name="cLocalidadeIncid" type="TSCodMunIBGE">
        <xs:annotation>
          <xs:documentation>
            Código IBGE da localidade de incidência do IBS/CBS (local da operação)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xLocalidadeIncid" type="TSDesc600">
        <xs:annotation>
          <xs:documentation>
            Nome da localidade de incidência do IBS/CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pRedutor" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            Percentual de redução de aliquota em compra governamental
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="valores" type="TCRTCValoresIBSCBS">
        <xs:annotation>
          <xs:documentation>
            Grupo de valores brutos referentes ao IBS/CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="totCIBS" type="TCRTCTotalCIBS">
        <xs:annotation>
          <xs:documentation>
            Grupo de Totalizadores
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO DOS VALORES BRUTOS IBSCBS-->
  <xs:complexType name="TCRTCValoresIBSCBS">
    <xs:sequence>
      <xs:element name="vBC" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor da base de cálculo (BC) do IBS/CBS antes das reduções para cálculo do tributo bruto
            vBC = vServ - descIncond – vCalcReeRepRes – vISSQN – vPIS - vCOFINS (até 2026) ou
            vBC = vServ - descIncond – vCalcReeRepRes – vISSQN (até 2032)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vCalcReeRepRes" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor monetário (R$) total relativo ao fornecimento próprio de bens materiais ou relacionados a operações de terceiros, 
            objeto de reembolso, repasse ou ressarcimento pelo recebedor, já tributados e aqui referenciados e que não integram 
            da base de cálculo (BC) do ISSQN, do IBS e da CBS.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="uf" type="TCRTCValoresIBSCBSUF">
        <xs:annotation>
          <xs:documentation>
            Grupo de Informações relativas aos valores do IBS Estadual
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="mun" type="TCRTCValoresIBSCBSMun">
        <xs:annotation>
          <xs:documentation>
            Grupo de Informações relativas aos valores do IBS Municipal
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="fed" type="TCRTCValoresIBSCBSFed">
        <xs:annotation>
          <xs:documentation>
            Grupo de Informações relativas aos valores da CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO IBS ESTADUAL-->
  <xs:complexType name="TCRTCValoresIBSCBSUF">
    <xs:sequence>
      <xs:element name="pIBSUF" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            Alíquota da UF para IBS da localidade de incidência parametrizada no sistema
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pRedAliqUF" type="TSDec3V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Percentual de redução de alíquota estadual
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pAliqEfetUF" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            pAliqEfetUF = pIBSUF x (1 - pRedAliqUF) x (1 - pRedutor)
            Se pRedAliqUF não for informado na DPS, então pAliqEfetUF é a própria pIBSUF
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO IBS MUNICIPAL-->
  <xs:complexType name="TCRTCValoresIBSCBSMun">
    <xs:sequence>
      <xs:element name="pIBSMun" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            Alíquota do Município para IBS da localidade de incidência parametrizada no sistema
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pRedAliqMun" type="TSDec3V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Percentual de redução de alíquota municipal
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pAliqEfetMun" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            pAliqEfetMun = pIBSMun x (1 - pRedAliqMun) x (1 - pRedutor)
            Se pRedAliqMun não for informado na DPS, então pAliqEfetMun é a própria pIBSMun
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO CBS-->
  <xs:complexType name="TCRTCValoresIBSCBSFed">
    <xs:sequence>
      <xs:element name="pCBS" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            Alíquota da União para CBS parametrizada no sistema
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pRedAliqCBS" type="TSDec3V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Percentual da redução de alíquota da CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pAliqEfetCBS" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            pAliqEfetCBS = pCBS x (1 - pRedAliqCBS) x (1 - pRedutor)
            Se pRedAliqCBS não for informado na DPS, então pAliqEfetCBS é a própria pCBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO DE TOTALIZADORES IBSCBS-->
  <xs:complexType name="TCRTCTotalCIBS">
    <xs:sequence>
      <xs:element name="vTotNF" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor Total da NF considerando os impostos por fora: IBS e CBS
            O IBS e a CBS são por fora, por isso seus valores devem ser adicionados ao valor total da NF
            vTotNF = vLiq (em 2026)
            vTotNF = vLiq + vCBS + vIBSTot (a partir de 2027)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="gIBS" type="TCRTCTotalIBS">
        <xs:annotation>
          <xs:documentation>
            Grupo de valores referentes ao IBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="gCBS" type="TCRTCTotalCBS">
        <xs:annotation>
          <xs:documentation>
            Grupo de valores referentes à CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="gTribRegular" type="TCRTCTotalTribRegular" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações de tributação regular
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="gTribCompraGov" type="TCRTCTotalTribCompraGov" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações da composição do valor do IBS e da CBS em compras governamentais
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO DE TOTALIZADORES DOS VALORES IBS-->
  <xs:complexType name="TCRTCTotalIBS">
    <xs:sequence>
      <xs:element name="vIBSTot" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor total do IBS.
            vIBSTot = vIBSUF + vIBSMun
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="gIBSCredPres" type="TCRTCTotalIBSCredPres" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de valores referentes ao crédito presumido para IBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="gIBSUFTot" type="TCRTCTotalIBSUF">
        <xs:annotation>
          <xs:documentation>
            Grupo de valores referentes ao IBS Estadual
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="gIBSMunTot" type="TCRTCTotalIBSMun">
        <xs:annotation>
          <xs:documentation>
            Grupo de valores referentes ao IBS Municipal
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO DE TOTALIZADORES DOS VALORES CREDITO PRESUMIDO IBS-->
  <xs:complexType name="TCRTCTotalIBSCredPres">
    <xs:sequence>
      <xs:element name="pCredPresIBS" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            Alíquota do crédito presumido para o IBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vCredPresIBS" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor do Crédito Presumido para o IBS
            vCredPresIBS = vBC x pCredPresIBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO DE TOTALIZADORES DOS VALORES IBS ESTADUAL-->
  <xs:complexType name="TCRTCTotalIBSUF">
    <xs:sequence>
      <xs:element name="vDifUF" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Total do Diferimento do IBS estadual
            vDifUF = vIBSUF x pDifUF
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vIBSUF" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Total valor do IBS estadual
            vIBSUF = vBC x (pIBSUF ou pAliqEfetUF)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO DE TOTALIZADORES DOS VALORES IBS MUNICIPAL-->
  <xs:complexType name="TCRTCTotalIBSMun">
    <xs:sequence>
      <xs:element name="vDifMun" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Total do Diferimento do IBS municipal
            vDifMun = vIBSMun x pDifMun
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vIBSMun" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Total valor do IBS municipal
            vIBSMun = vBC x (pIBSMun ou pAliqEfetMun)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO DE TOTALIZADORES DOS VALORES CBS-->
  <xs:complexType name="TCRTCTotalCBS">
    <xs:sequence>
      <xs:element name="gCBSCredPres" type="TCRTCTotalCBSCredPres" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de valores referentes ao crédito presumido para CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vDifCBS" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Total do Diferimento CBS
            vDifCBS = vCBS x pDifCBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vCBS" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Total valor da CBS da União
            vCBS = vBC x (pCBS ou pAliqEfetCBS)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO DE TOTALIZADORES DOS VALORES CREDITO PRESUMIDO CBS-->
  <xs:complexType name="TCRTCTotalCBSCredPres">
    <xs:sequence>
      <xs:element name="pCredPresCBS" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            Alíquota do crédito presumido para a CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vCredPresCBS" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor do Crédito Presumido da CBS
            vCredPresCBS = vBC x pCredPresCBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO DE TOTALIZADORES DOS VALORES TRIBUTAÇÃO REGULAR-->
  <xs:complexType name="TCRTCTotalTribRegular">
    <xs:sequence>
      <xs:element name="pAliqEfeRegIBSUF" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            Alíquota efetiva de tributação regular do IBS estadual
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vTribRegIBSUF" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor da tributação regular do IBS estadual
            vTribRegIBSUF = vBC x pAliqEfeRegIBSUF
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pAliqEfeRegIBSMun" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            Alíquota efetiva de tributação regular do IBS municipal
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vTribRegIBSMun" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor da tributação regular do IBS municipal
            vTribRegIBSMun = vBC x pAliqEfeRegIBSMun
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pAliqEfeRegCBS" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            Alíquota efetiva de tributação regular da CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vTribRegCBS" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor da tributação regular da CBS
            vTribRegCBS = vBC x pAliqEfeRegCBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO DE TOTALIZADORES DOS VALORES IBSCBS EM COMPRAS GOVERNAMENTAIS-->
  <xs:complexType name="TCRTCTotalTribCompraGov">
    <xs:sequence>
      <xs:element name="pIBSUF" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            Alíquota do IBS de competência do Estado
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vIBSUF" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor do Tributo do IBS da UF calculado
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pIBSMun" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            Alíquota do IBS de competência do Município
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vIBSMun" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor do Tributo do IBS do Município calculado
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pCBS" type="TSDec2V2">
        <xs:annotation>
          <xs:documentation>
            Alíquota da CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vCBS" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor do Tributo da CBS calculado
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO DPS-->
  <xs:complexType name="TCDPS">
    <xs:sequence>
      <xs:element name="infDPS" type="TCInfDPS"/>
      <xs:element ref="ds:Signature" minOccurs="0"/>
    </xs:sequence>
    <xs:attribute name="versao" type="TVerNFSe" use="required"/>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DA DPS-->
  <xs:complexType name="TCInfDPS">
    <xs:sequence>
      <xs:element name="tpAmb" type="TSTipoAmbiente">
        <xs:annotation>
          <xs:documentation>Identificação do Ambiente: 1 - Produção; 2 - Homologação</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="dhEmi" type="TSDateTimeUTC">
        <xs:annotation>
          <xs:documentation>Data e hora da emissão do DPS. Data e hora no formato UTC (Universal Coordinated Time): AAAA-MM-DDThh:mm:ssTZD</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="verAplic" type="TSVerAplic">
        <xs:annotation>
          <xs:documentation>Versão do aplicativo que gerou o DPS</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="serie" type="TSSerieDPS">
        <xs:annotation>
          <xs:documentation>Número do equipamento emissor do DPS ou série do DPS</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nDPS" type="TSNumDPS">
        <xs:annotation>
          <xs:documentation>Número do DPS</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="dCompet" type="TSData">
        <xs:annotation>
          <xs:documentation>Data em que se iniciou a prestação do serviço: Dia, mês e ano (AAAAMMDD)</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="tpEmit" type="TSEmitenteDPS">
        <xs:annotation>
          <xs:documentation>Emitente da DPS: 1 - Prestador; 2 - Tomador; 3 - Intermediário</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element minOccurs="0" name="cMotivoEmisTI" type="TSMotivoEmisTI">
        <xs:annotation>
          <xs:documentation>Motivo da Emissão da DPS pelo Tomador/Intermediário:
            1 - Importação de Serviço;
            2 - Tomador/Intermediário obrigado a emitir NFS-e por legislação municipal;
            3 - Tomador/Intermediário emitindo NFS-e por recusa de emissão pelo prestador;
            4 - Tomador/Intermediário emitindo por rejeitar a NFS-e emitida pelo prestador;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element minOccurs="0" name="chNFSeRej" type="TSChaveNFSe">
        <xs:annotation>
          <xs:documentation>
            Chave de Acesso da NFS-e rejeitada pelo Tomador/Intermediário.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cLocEmi" type="TSCodMunIBGE">
        <xs:annotation>
          <xs:documentation>O código de município utilizado pelo Sistema Nacional NFS-e é o código definido para cada município pertencente ao &quot;&quot;Anexo V – Tabela de Código de Municípios do IBGE&quot;&quot;, que consta ao final do Manual de Orientação ao Contribuinte do ISSQN para a Sefin Nacional NFS-e.
            O município emissor da NFS-e é aquele município em que o emitente da DPS está cadastrado e autorizado a &quot;emitir uma NFS-e&quot;, ou seja, emitir uma DPS para que o sistema nacional valide as informações nela prestadas e gere a NFS-e correspondente para o emitente.
            Para que o sistema nacional emita a NFS-e o município emissor deve ser conveniado e estar ativo no sistema nacional. Além disso o convênio do município deve permitir que os contribuintes do município utilize os emissores públicos do Sistema Nacional NFS-e
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="subst" type="TCSubstituicao" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Dados da NFS-e a ser substituída</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="prest" type="TCInfoPrestador">
        <xs:annotation>
          <xs:documentation>Grupo de informações do DPS relativas ao Prestador de Serviços</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="toma" type="TCInfoPessoa" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Grupo de informações do DPS relativas ao Tomador de Serviços</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="interm" type="TCInfoPessoa" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Grupo de informações do DPS relativas ao Intermediário de Serviços</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="serv" type="TCServ">
        <xs:annotation>
          <xs:documentation>Grupo de informações do DPS relativas ao Serviço Prestado</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="valores" type="TCInfoValores">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relativas à valores do serviço prestado
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="IBSCBS" type="TCRTCInfoIBSCBS" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações declaradas pelo emitente referentes ao IBS e à CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
    <xs:attribute name="Id" type="TSIdDPS" use="required"/>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE SUBSTITUIÇÃO DE NFS-E-->
  <xs:complexType name="TCSubstituicao">
    <xs:sequence>
      <xs:element name="chSubstda" type="TSChaveNFSe">
        <xs:annotation>
          <xs:documentation>Chave de acesso da NFS-e a ser substituída</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cMotivo" type="TSCodJustSubst">
        <xs:annotation>
          <xs:documentation>
            Código de justificativa para substituição de NFS-e:
            01 - Desenquadramento de NFS-e do Simples Nacional;
            02 - Enquadramento de NFS-e no Simples Nacional;
            03 - Inclusão Retroativa de Imunidade/Isenção para NFS-e;
            04 - Exclusão Retroativa de Imunidade/Isenção para NFS-e;
            05 - Rejeição de NFS-e pelo tomador ou pelo intermediário se responsável pelo recolhimento do tributo;
            99 - Outros;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xMotivo" type="TSMotivo" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Descrição do motivo da substituição da NFS-e</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE UMA PESSOA ENVOLVIDA NA NFS-E (TOMADOR, INTERMEDIÁRIO E FORNECEDOR PARA DEDUÇÃO)-->
  <xs:complexType name="TCInfoPrestador">
    <xs:annotation>
      <xs:documentation>Informações do prestador da NFS-e. Difere das demais pessoas por causa das informações de regimes de tributação</xs:documentation>
    </xs:annotation>
    <xs:sequence>
      <xs:choice>
        <xs:element name="CNPJ" type="TSCNPJ">
          <xs:annotation>
            <xs:documentation>Número do CNPJ</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="CPF" type="TSCPF">
          <xs:annotation>
            <xs:documentation>Número do CPF</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="NIF" type="TSNIF">
          <xs:annotation>
            <xs:documentation>Número de Identificação Fiscal fornecido por órgão de administração tributária no exterior</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="cNaoNIF" type="TSCodNaoNIF">
          <xs:annotation>
            <xs:documentation>
              Motivo para não informação do NIF:
              0 - Não informado na nota de origem;
              1 - Dispensado do NIF;
              2 - Não exigência do NIF;
            </xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
      <xs:element name="CAEPF" type="TSCAEPF" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Número do Cadastro de Atividade Econômica da Pessoa Física (CAEPF) do prestador do serviço.</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="IM" type="TSInscMun" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Número da inscrição municipal</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xNome" type="TSNomeRazaoSocial" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Nome/Nome Empresarial do prestador</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="end" type="TCEndereco" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Dados de endereço do prestador</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="fone" type="TSTelefone" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Número do telefone do prestador:
            Preencher com o Código DDD + número do telefone.
            Nas operações com exterior é permitido informar o código do país + código da localidade + número do telefone)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="email" type="TSEmail" minOccurs="0">
        <xs:annotation>
          <xs:documentation>E-mail</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="regTrib" type="TCRegTrib">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relativas aos regimes de tributação do prestador de serviços
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE REGIMES DE TRIBUTAÇÃO ESPECÍFICOS DO CONTRIBUINTE-->
  <xs:complexType name="TCRegTrib">
    <xs:sequence>
      <xs:element name="opSimpNac" type="TSOpSimpNac">
        <xs:annotation>
          <xs:documentation>
            Situação perante o Simples Nacional:
            1 - Não Optante;
            2 - Optante - Microempreendedor Individual (MEI);
            3 - Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP);
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="regApTribSN" type="TSRegimeApuracaoSimpNac" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Opção para que o contribuinte optante pelo Simples Nacional ME/EPP (opSimpNac = 3) possa indicar, ao emitir o documento fiscal, em qual regime de apuração os tributos federais e municipal estão inseridos, caso tenha ultrapassado algum sublimite ou limite definido para o Simples Nacional.
            1 – Regime de apuração dos tributos federais e municipal pelo SN;
            2 – Regime de apuração dos tributos federais pelo SN e ISSQN  por fora do SN conforme respectiva legislação municipal do tributo;
            3 – Regime de apuração dos tributos federais e municipal por fora do SN conforme respectivas legilações federal e municipal de cada tributo;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="regEspTrib" type="TSRegEspTrib">
        <xs:annotation>
          <xs:documentation>
            Tipos de Regimes Especiais de Tributação:
            0 - Nenhum;
            1 - Ato Cooperado (Cooperativa);
            2 - Estimativa;
            3 - Microempresa Municipal;
            4 - Notário ou Registrador;
            5 - Profissional Autônomo;
            6 - Sociedade de Profissionais;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE UMA PESSOA ENVOLVIDA NA NFS-E (TOMADOR, INTERMEDIÁRIO E FORNECEDOR PARA DEDUÇÃO)-->
  <xs:complexType name="TCInfoPessoa">
    <xs:annotation>
      <xs:documentation>Informações das pessoas envolvidas na NFS-e. Pode ser o tomador, o intermediário ou o fornecedor (dedução/redução)</xs:documentation>
    </xs:annotation>
    <xs:sequence>
      <xs:choice>
        <xs:element name="CNPJ" type="TSCNPJ">
          <xs:annotation>
            <xs:documentation>Número do CNPJ</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="CPF" type="TSCPF">
          <xs:annotation>
            <xs:documentation>Número do CPF</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="NIF" type="TSNIF">
          <xs:annotation>
            <xs:documentation>Número de Identificação Fiscal fornecido por órgão de administração tributária no exterior</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="cNaoNIF" type="TSCodNaoNIF">
          <xs:annotation>
            <xs:documentation>
              Motivo para não informação do NIF:
              0 - Não informado na nota de origem;
              1 - Dispensado do NIF;
              2 - Não exigência do NIF;
            </xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
      <xs:element name="CAEPF" type="TSCAEPF" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Número do Cadastro de Atividade Econômica da Pessoa Física (CAEPF) do tomador, intermediário ou fornecedor do serviço.</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="IM" type="TSInscMun" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Número da inscrição municipal</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xNome" type="TSNomeRazaoSocial">
        <xs:annotation>
          <xs:documentation>Nome/Nome Empresarial</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="end" type="TCEndereco" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Dados de endereço</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="fone" type="TSTelefone" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Número do telefone do prestador:
            Preencher com o Código DDD + número do telefone.
            Nas operações com exterior é permitido informar o código do país + código da localidade + número do telefone)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="email" type="TSEmail" minOccurs="0">
        <xs:annotation>
          <xs:documentation>E-mail</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA ENDEREÇO -->
  <xs:complexType name="TCEndereco">
    <xs:sequence>
      <xs:choice>
        <xs:element name="endNac" type="TCEnderNac">
          <xs:annotation>
            <xs:documentation>Grupo de informações específicas de endereço nacional</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="endExt" type="TCEnderExt">
          <xs:annotation>
            <xs:documentation>Grupo de informações específicas de endereço no exterior</xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
      <xs:element name="xLgr" type="TSLogradouro">
        <xs:annotation>
          <xs:documentation>Tipo e nome do logradouro da localização do imóvel</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nro" type="TSNumeroEndereco">
        <xs:annotation>
          <xs:documentation>Número do imóvel</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xCpl" type="TSComplementoEndereco" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Complemento do endereço</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xBairro" type="TSBairro">
        <xs:annotation>
          <xs:documentation>Bairro</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DO ENDERECO DO EMITENTE DA NFSE -->
  <xs:complexType name="TCEnderecoEmitente">
    <xs:sequence>
      <xs:element name="xLgr" type="TSLogradouro">
        <xs:annotation>
          <xs:documentation>Tipo e nome do logradouro da localização do imóvel</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nro" type="TSNumeroEndereco">
        <xs:annotation>
          <xs:documentation>Número do imóvel</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xCpl" type="TSComplementoEndereco" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Complemento do endereço</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xBairro" type="TSBairro">
        <xs:annotation>
          <xs:documentation>Bairro</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cMun" type="TSCodMunIBGE">
        <xs:annotation>
          <xs:documentation>Código do município, conforme Tabela do IBGE</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="UF" type="TSUF">
        <xs:annotation>
          <xs:documentation>Sigla da unidade da federação do município do endereço do emitente.</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="CEP" type="TSCEP">
        <xs:annotation>
          <xs:documentation>Número do CEP</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO ENDEREÇO SIMPLES -->
  <xs:complexType name="TCEnderecoSimples">
    <xs:sequence>
      <xs:choice>
        <xs:element name="CEP" type="TSCEP">
          <xs:annotation>
            <xs:documentation>Número do CEP</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="endExt" type="TCEnderExtSimples">
          <xs:annotation>
            <xs:documentation>Grupo de informações específicas de endereço no exterior</xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
      <xs:element name="xLgr" type="TSLogradouro">
        <xs:annotation>
          <xs:documentation>Tipo e nome do logradouro da localização do imóvel</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nro" type="TSNumeroEndereco">
        <xs:annotation>
          <xs:documentation>Número do imóvel</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xCpl" type="TSComplementoEndereco" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Complemento do endereço</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xBairro" type="TSBairro">
        <xs:annotation>
          <xs:documentation>Bairro</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA OS CAMPOS ESPECÍFICOS DE ENDEREÇO NACIONAL-->
  <xs:complexType name="TCEnderNac">
    <xs:sequence>
      <xs:element name="cMun" type="TSCodMunIBGE">
        <xs:annotation>
          <xs:documentation>Código do município, conforme Tabela do IBGE</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="CEP" type="TSCEP">
        <xs:annotation>
          <xs:documentation>Número do CEP</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA OS CAMPOS ESPECÍFICOS DE ENDEREÇO NO EXTERIOR-->
  <xs:complexType name="TCEnderExt">
    <xs:sequence>
      <xs:element name="cPais" type="TSCodPaisISO">
        <xs:annotation>
          <xs:documentation>Código do país (Tabela de Países ISO)</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cEndPost" type="TSCodigoEndPostal">
        <xs:annotation>
          <xs:documentation>Código alfanumérico do Endereçamento Postal no exterior do prestador do serviço.</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xCidade" type="TSCidade">
        <xs:annotation>
          <xs:documentation>Nome da cidade no exterior do prestador do serviço.</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xEstProvReg" type="TSEstadoProvRegiao">
        <xs:annotation>
          <xs:documentation>Estado, província ou região da cidade no exterior do prestador do serviço.</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO ENDEREÇO EXTERIOR SIMPLES -->
  <xs:complexType name="TCEnderExtSimples">
    <xs:sequence>
      <xs:element name="cEndPost" type="TSCodigoEndPostal">
        <xs:annotation>
          <xs:documentation>Código alfanumérico do Endereçamento Postal no exterior do prestador do serviço.</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xCidade" type="TSCidade">
        <xs:annotation>
          <xs:documentation>Nome da cidade no exterior do prestador do serviço.</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xEstProvReg" type="TSEstadoProvRegiao">
        <xs:annotation>
          <xs:documentation>Estado, província ou região da cidade no exterior do prestador do serviço.</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA ENDEREÇO DE OBRA-->
  <xs:complexType name="TCEnderObraEvento">
    <xs:sequence>
      <xs:choice>
        <xs:element minOccurs="1" name="CEP" type="TSCEP">
          <xs:annotation>
            <xs:documentation>Número do CEP</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element minOccurs="1" name="endExt" type="TCEnderExtSimples">
          <xs:annotation>
            <xs:documentation>Grupo de informações específicas de endereço no exterior</xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
      <xs:element name="xLgr" type="TSLogradouro">
        <xs:annotation>
          <xs:documentation>Tipo e nome do logradouro da localização do imóvel</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nro" type="TSNumeroEndereco">
        <xs:annotation>
          <xs:documentation>Número do imóvel</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xCpl" type="TSComplementoEndereco" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Complemento do endereço</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xBairro" type="TSBairro">
        <xs:annotation>
          <xs:documentation>Bairro</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DO SERVIÇO PRESTADO-->
  <xs:complexType name="TCServ">
    <xs:sequence>
      <xs:element name="locPrest" type="TCLocPrest">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relativas ao local da prestação do serviço
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cServ" type="TCCServ">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relativas ao código do serviço prestado
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="comExt" type="TCComExterior" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Grupo de informações relativas à exportação/importação de serviço prestado</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="lsadppu" type="TCLocacaoSublocacao" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Grupo de informações relativas a atividades de Locação, sublocação, arrendamento, direito de passagem ou permissão de uso, compartilhado ou não, de ferrovia, rodovia, postes, cabos, dutos e condutos de qualquer natureza</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="obra" type="TCInfoObra" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Grupo de informações do DPS relativas à serviço de obra</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="atvEvento" type="TCAtvEvento" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Grupo de informações do DPS relativas à Evento</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="explRod" type="TCExploracaoRodoviaria" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Grupo de informações relativas a pedágio</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="infoCompl" type="TCInfoCompl" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações complementares disponível para todos os serviços prestados
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DO LOCAL DA PRESTAÇÃO DO SERVIÇO-->
  <xs:complexType name="TCLocPrest">
    <xs:choice minOccurs="1">
      <xs:element name="cLocPrestacao" type="TSCodMunIBGE">
        <xs:annotation>
          <xs:documentation>Código do município onde o serviço foi prestado (tabela do IBGE)</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cPaisPrestacao" type="TSCodPaisISO">
        <xs:annotation>
          <xs:documentation>Código do país onde o serviço foi prestado (Tabela de Países ISO)</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:choice>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES RELATIVAS AO CÓDIGO DO SERVIÇO PRESTADO-->
  <xs:complexType name="TCCServ">
    <xs:sequence>
      <xs:element name="cTribNac" type="TSCodTribNac">
        <xs:annotation>
          <xs:documentation>
            Código de tributação nacional do ISSQN, nos termos da LC 116/2003, conforme aba MUN.INCID_INFO.SERV. do ANEXO I
            Regra de formação - 6 dígitos numéricos sendo: 2 para Item (LC 116/2003), 2 para Subitem (LC 116/2003) e 2 para Desdobro Nacional
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cTribMun" type="TCCodTribMun" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Código de tributação municipal do ISSQN</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xDescServ" type="TSDesc2000">
        <xs:annotation>
          <xs:documentation>Descrição completa do serviço prestado</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cNBS" type="TSCodNBS">
        <xs:annotation>
          <xs:documentation>Código NBS correspondente ao serviço prestado, seguindo a versão 2.0, conforme Anexo B</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cIntContrib" type="TSCodigoInternoContribuinte" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Código interno do contribuinte
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE COMÉRCIO EXTERIOR-->
  <xs:complexType name="TCComExterior">
    <xs:sequence>
      <xs:element name="mdPrestacao" type="TSModoPrestacao">
        <xs:annotation>
          <xs:documentation>
            Modo de Prestação:
            0 - Desconhecido (tipo não informado na nota de origem);
            1 - Transfronteiriço;
            2 - Consumo no Brasil;
            3 - Movimento Temporário de Pessoas Físicas;
            4 - Consumo no Exterior;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vincPrest" type="TSVincPrest">
        <xs:annotation>
          <xs:documentation>Vínculo entre as partes no negócio:
            0 - Sem vínculo com o Tomador/Prestador
            1 - Controlada;
            2 - Controladora;
            3 - Coligada;
            4 - Matriz;
            5 - Filial ou sucursal;
            6 - Outro vínculo;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="tpMoeda" type="TSCodMoeda">
        <xs:annotation>
          <xs:documentation>Identifica a moeda da transação comercial</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vServMoeda" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>Valor do serviço prestado expresso em moeda estrangeira especificada em tpmoeda</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="mecAFComexP" type="TSMecAFComExPrest">
        <xs:annotation>
          <xs:documentation>
            Mecanismo de apoio/fomento ao Comércio Exterior utilizado pelo prestador do serviço:
            00 - Desconhecido (tipo não informado na nota de origem);
            01 - Nenhum;
            02 - ACC - Adiantamento sobre Contrato de Câmbio – Redução a Zero do IR e do IOF;
            03 - ACE – Adiantamento sobre Cambiais Entregues - Redução a Zero do IR e do IOF;
            04 - BNDES-Exim Pós-Embarque – Serviços;
            05 - BNDES-Exim Pré-Embarque - Serviços;
            06 - FGE - Fundo de Garantia à Exportação;
            07 - PROEX - EQUALIZAÇÃO
            08 - PROEX - Financiamento;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="mecAFComexT" type="TSMecAFComExToma">
        <xs:annotation>
          <xs:documentation>
            Mecanismo de apoio/fomento ao Comércio Exterior utilizado pelo tomador do serviço:
            00 - Desconhecido (tipo não informado na nota de origem);
            01 - Nenhum;
            02 - Adm. Pública e Repr. Internacional;
            03 - Alugueis e Arrend. Mercantil de maquinas, equip., embarc. e aeronaves;
            04 - Arrendamento Mercantil de aeronave para empresa de transporte aéreo público;
            05 - Comissão a agentes externos na exportação;
            06 - Despesas de armazenagem, mov. e transporte de carga no exterior;
            07 - Eventos FIFA (subsidiária);
            08 - Eventos FIFA;
            09 - Fretes, arrendamentos de embarcações ou aeronaves e outros;
            10 - Material Aeronáutico;
            11 - Promoção de Bens no Exterior;
            12 - Promoção de Dest. Turísticos Brasileiros;
            13 - Promoção do Brasil no Exterior;
            14 - Promoção Serviços no Exterior;
            15 - RECINE;
            16 - RECOPA;
            17 - Registro e Manutenção de marcas, patentes e cultivares;
            18 - REICOMP;
            19 - REIDI;
            20 - REPENEC;
            21 - REPES;
            22 - RETAERO; 
            23 - RETID;
            24 - Royalties, Assistência Técnica, Científica e Assemelhados;
            25 - Serviços de avaliação da conformidade vinculados aos Acordos da OMC;
            26 - ZPE;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="movTempBens" type="TSMovTempBens">
        <xs:annotation>
          <xs:documentation>
            Vínculo da Operação à Movimentação Temporária de Bens:
            0 - Desconhecido (tipo não informado na nota de origem);
            1 - Não;
            2 - Vinculada - Declaração de Importação;
            3 - Vinculada - Declaração de Exportação;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nDI" type="TSNumDocImport" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Número da Declaração de Importação (DI/DSI/DA/DRI-E) averbado</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nRE" type="TSNumRegExport" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Número do Registro de Exportação (RE) averbado</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="mdic" type="TSEnvMDIC">
        <xs:annotation>
          <xs:documentation>
            Compartilhar as informações da NFS-e gerada a partir desta DPS com a Secretaria de Comércio Exterior:
            0 - Não enviar para o MDIC;
            1 - Enviar para o MDIC;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE PEDÁGIO-->
  <xs:complexType name="TCExploracaoRodoviaria">
    <xs:sequence>
      <xs:element name="categVeic" type="TSCategVeic">
        <xs:annotation>
          <xs:documentation>
            Categorias de veículos para cobrança:
            00 - Categoria de veículos (tipo não informado na nota de origem)
            01 - Automóvel, caminhonete e furgão;
            02 - Caminhão leve, ônibus, caminhão trator e furgão;
            03 - Automóvel e caminhonete com semireboque;
            04 - Caminhão, caminhão-trator, caminhão-trator com semi-reboque e ônibus;
            05 - Automóvel e caminhonete com reboque;
            06 - Caminhão com reboque;
            07 - Caminhão trator com semi-reboque;
            08 - Motocicletas, motonetas e bicicletas motorizadas;
            09 - Veículo especial;
            10 - Veículo Isento;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nEixos" type="TSNumEixos">
        <xs:annotation>
          <xs:documentation>Número de eixos para fins de cobrança</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="rodagem" type="TSRodagem">
        <xs:annotation>
          <xs:documentation>Tipo de rodagem</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="sentido" type="TSSentido">
        <xs:annotation>
          <xs:documentation>Placa do veículo</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="placa" type="TSPlaca">
        <xs:annotation>
          <xs:documentation>Placa do veículo</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="codAcessoPed" type="TSCodAcessoPed">
        <xs:annotation>
          <xs:documentation>Código de acesso gerado automaticamente pelo sistema emissor da concessionária.</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="codContrato" type="TSCodContrato">
        <xs:annotation>
          <xs:documentation>Código de contrato gerado automaticamente pelo sistema nacional no cadastro da concessionária.</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE LOCAÇÃO, SUBLOCAÇÃO, ARRENDAMENTO, DIRETO DE PASSAGEM OU PERMISSÃO DE USO-->
  <xs:complexType name="TCLocacaoSublocacao">
    <xs:sequence>
      <xs:element name="categ" type="TSCategoriaServico">
        <xs:annotation>
          <xs:documentation>Categoria do serviço</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="objeto" type="TCObjetoLocacao">
        <xs:annotation>
          <xs:documentation>Tipo de objetos da locação, sublocação, arrendamento, direito de passagem ou permissão de uso</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="extensao" type="TSExtensaoTotal">
        <xs:annotation>
          <xs:documentation>Extensão total da ferrovia, rodovia, cabos, dutos ou condutos</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nPostes" type="TSNumeroPostes">
        <xs:annotation>
          <xs:documentation>Número total de postes</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE ATIVIDADE DE EVENTO-->
  <xs:complexType name="TCAtvEvento">
    <xs:sequence>
      <xs:element name="xNome" type="TSDesc255">
        <xs:annotation>
          <xs:documentation>Descrição do evento Artístico, Cultural, Esportivo, etc</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="dtIni" type="TSData">
        <xs:annotation>
          <xs:documentation>Data de início da atividade de evento. Ano, Mês e Dia (AAAA-MM-DD)</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="dtFim" type="TSData">
        <xs:annotation>
          <xs:documentation>Data de fim da atividade de evento. Ano, Mês e Dia (AAAA-MM-DD)</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:choice>
        <xs:element name="idAtvEvt" type="TSIdeEvento">
          <xs:annotation>
            <xs:documentation>Identificação da Atividade de Evento (código identificador de evento determinado pela Administração Tributária Municipal)</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="end" type="TCEnderecoSimples">
          <xs:annotation>
            <xs:documentation>Grupo de informações relativas ao endereço da atividade, evento ou local do serviço prestado</xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE OBRA-->
  <xs:complexType name="TCInfoObra">
    <xs:sequence>
      <xs:element minOccurs="0" name="inscImobFisc" type="TSInscImobFisc">
        <xs:annotation>
          <xs:documentation>Inscrição imobiliária fiscal (código fornecido pela Prefeitura Municipal para a identificação da obra ou para fins de recolhimento do IPTU)</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:choice minOccurs="1">
        <xs:element name="cObra" type="TSCodObra">
          <xs:annotation>
            <xs:documentation
              >Número de identificação da obra.
              Cadastro Nacional de Obras (CNO) ou Cadastro Específico do INSS (CEI).
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="cCIB" type="TSCodCIB">
          <xs:annotation>
            <xs:documentation>
              Código do Cadastro Imobiliário Brasileiro - CIB.
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="end" type="TCEnderObraEvento">
          <xs:annotation>
            <xs:documentation>Grupo de informações do endereço da obra do serviço prestado
            </xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES COMPLEMENTARES DO SERVIÇO PRESTADO-->
  <xs:complexType name="TCInfoCompl">
    <xs:sequence>
      <xs:element name="idDocTec" type="TSDRT" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Identificador de Documento de Responsabilidade Técnica: ART, RRT, DRT, Outros.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="docRef" type="TSDesc255" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Chave da nota, número identificador da nota, número do contrato ou outro identificador de documento emitido pelo prestador de serviços, que subsidia a emissão dessa nota pelo tomador do serviço ou intermediário (preenchimento obrigatório caso a nota esteja sendo emitida pelo Tomador ou intermediário do serviço).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xPed" type="TSNumeroEndereco" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Número do  pedido/ordem de compra/ordem de serviço/projeto que autorize a prestação do serviço em operações B2B - Informação de interesse do tomador do serviço para controle e gestão da Negociação
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="gItemPed" type="TCInfoItemPed" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de itens do pedido/ordem de compra/ordem de serviço/projeto
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xInfComp" type="TSDescInfCompl" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Informações complementares
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA GRUPO DE ITENS DO PEDIDO/ORDEM DE COMPRA/ORDEM DE SERVIÇO/PROJETO-->
  <xs:complexType name="TCInfoItemPed">
    <xs:sequence>
      <xs:element name="xItemPed" type="TSNumeroEndereco" maxOccurs="99">
        <xs:annotation>
          <xs:documentation>
            Número do item do  pedido/ordem de compra/ordem de serviço/projeto - Identificação do número do item do pedido ou ordem de compra destacado e xPed
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>  
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE TRIBUTAÇÃO DA NFS-E-->
  <xs:complexType name="TCInfoValores">
    <xs:sequence>
      <xs:element name="vServPrest" type="TCVServPrest">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relativas aos valores do serviço prestado
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vDescCondIncond" type="TCVDescCondIncond" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relativas aos descontos condicionados e incondicionados
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vDedRed" type="TCInfoDedRed" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relativas ao valores para dedução/redução do valor da base de cálculo (valor do serviço)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="trib" type="TCInfoTributacao">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relacionados aos tributos relacionados ao serviço prestado
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE TRIBUTAÇÃO DA NFS-E-->
  <xs:complexType name="TCInfoTributacao">
    <xs:sequence>
      <xs:element name="tribMun" type="TCTribMunicipal">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relacionados ao Imposto Sobre Serviços de Qualquer Natureza - ISSQN
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="tribFed" type="TCTribFederal" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações de outros tributos relacionados ao serviço prestado
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="totTrib" type="TCTribTotal">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações para totais aproximados dos tributos relacionados ao serviço prestado
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES RELATIVAS AOS VALORES DO SERVIÇO PRESTADO-->
  <xs:complexType name="TCVServPrest">
    <xs:sequence>
      <xs:element name="vReceb" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Valor monetário recebido pelo intermediário do serviço (R$)</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vServ" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>Valor dos serviços em R$</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES RELATIVAS AOS DESCONTOS-->
  <xs:complexType name="TCVDescCondIncond">
    <xs:sequence>
      <xs:element name="vDescIncond" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Valor monetário do desconto incondicionado (R$)</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vDescCond" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Valor monetário do desconto condicionado (R$)</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE DEDUÇÃO/REDUÇÃO-->
  <xs:complexType name="TCInfoDedRed">
    <xs:sequence>
      <xs:choice>
        <xs:element name="pDR" type="TSDec3V2">
          <xs:annotation>
            <xs:documentation>
              Valor percentual padrão para dedução/redução do valor do serviço
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="vDR" type="TSDec15V2">
          <xs:annotation>
            <xs:documentation>
              Valor monetário padrão para dedução/redução do valor do serviço
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="documentos" type="TCListaDocDedRed">
          <xs:annotation>
            <xs:documentation>
              Grupo de informações de documento utilizado para Dedução/Redução do valor do serviço
            </xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA COMPORTAR A LISTA DE DOCUMENTOS DE DEDUÇÃO/REDUÇÃO-->
  <xs:complexType name="TCListaDocDedRed">
    <xs:sequence>
      <xs:element name="docDedRed" type="TCDocDedRed" minOccurs="1" maxOccurs="1000">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações de documento utilizado para Dedução/Redução do valor do serviço
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE DOCUMENTO INFORMADO PARA DEDUÇÃO/REDUÇÃO-->
  <xs:complexType name="TCDocDedRed">
    <xs:sequence>
      <xs:choice>
        <xs:element name="chNFSe" type="TSChaveNFSe">
          <xs:annotation>
            <xs:documentation>Chave de Acesso da NFS-e (Padrão Nacional)</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="chNFe" type="TSChaveNFe">
          <xs:annotation>
            <xs:documentation>Chave de Acesso da NF-e</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="NFSeMun" type="TCDocOutNFSe">
          <xs:annotation>
            <xs:documentation>Grupo de informações de Outras NFS-e (Padrão anterior de NFS-e)</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="NFNFS" type="TCDocNFNFS">
          <xs:annotation>
            <xs:documentation>Grupo de informações de NF ou NFS (Modelo não eletrônico)</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="nDocFisc" type="TSDesc255">
          <xs:annotation>
            <xs:documentation>Número de documento fiscal</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="nDoc" type="TSDesc255">
          <xs:annotation>
            <xs:documentation>Número de documento não fiscal</xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
      <xs:element name="tpDedRed" type="TSIdeDedRed">
        <xs:annotation>
          <xs:documentation>
            Identificação da Dedução/Redução:
            1 – Alimentação e bebidas/frigobar;
            2 – Materiais;
            5 – Repasse consorciado;
            6 – Repasse plano de saúde;
            7 – Serviços;
            8 – Subempreitada de mão de obra;
            99 – Outras deduções;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xDescOutDed" type="TSDescOutDedRed" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Descrição da Dedução/Redução quando a opção é "99 – Outras Deduções"</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="dtEmiDoc" type="xs:date">
        <xs:annotation>
          <xs:documentation>Data da emissão do documento dedutível. Ano, mês e dia (AAAA-MM-DD)</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vDedutivelRedutivel" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor monetário total dedutível/redutível no documento informado (R$).
            Este é o valor total no documento informado que é passível de dedução/redução.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vDeducaoReducao" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor monetário utilizado para dedução/redução do valor do serviço da NFS-e que está sendo emitida (R$).
            Deve ser menor ou igual ao valor deduzível/redutível (vDedutivelRedutivel).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="fornec" type="TCInfoPessoa" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Grupo de informações do Fornecedor em Deduções de Serviços</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE DOCUMENTO INFORMADO PARA DEDUÇÃO/REDUÇÃO DO TIPO OUTRAS NFS-E-->
  <xs:complexType name="TCDocOutNFSe">
    <xs:sequence>
      <xs:element name="cMunNFSeMun" type="TSCodMunIBGE">
        <xs:annotation>
          <xs:documentation>Código Município emissor da nota eletrônica municipal (Tabela do IBGE)</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nNFSeMun" type="TSNum15Dig">
        <xs:annotation>
          <xs:documentation>Número da nota eletrônica municipal</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cVerifNFSeMun" type="TSCodVerificacao">
        <xs:annotation>
          <xs:documentation>Código de Verificação da nota eletrônica municipal</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE DOCUMENTO INFORMADO PARA DEDUÇÃO/REDUÇÃO DO TIPO NF ou NFS-->
  <xs:complexType name="TCDocNFNFS">
    <xs:sequence>
      <xs:element name="nNFS" type="TSNum7Dig">
        <xs:annotation>
          <xs:documentation>Número da Nota Fiscal NF ou NFS</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="modNFS" type="TSNum15Dig">
        <xs:annotation>
          <xs:documentation>Modelo da Nota Fiscal NF ou NFS</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="serieNFS" type="TSSerieNFNFS">
        <xs:annotation>
          <xs:documentation>Série Nota Fiscal NF ou NFS</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE TRIBUTAÇÃO ESPECÍFICA DO ISSQN-->
  <xs:complexType name="TCTribMunicipal">
    <xs:sequence>
      <xs:element name="tribISSQN" type="TSTribISSQN">
        <xs:annotation>
          <xs:documentation>
            Tributação do ISSQN sobre o serviço prestado:
            1 - Operação tributável;
            2 - Imunidade;
            3 - Exportação de serviço;
            4 - Não Incidência;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cPaisResult" type="TSCodPaisISO" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Código do país onde se verficou o resultado da prestação do serviço para o caso de Exportação de Serviço.(Tabela de Países ISO)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="tpImunidade" type="TSTipoImunidadeISSQN" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Identificação da Imunidade do ISSQN – somente para o caso de Imunidade.
            Tipos de Imunidades:            
            0 - Imunidade (tipo não informado na nota de origem);
            1 - Patrimônio, renda ou serviços, uns dos outros (CF88, Art 150, VI, a);
            2 - Templos de qualquer culto (CF88, Art 150, VI, b);
            3 - Patrimônio, renda ou serviços dos partidos políticos, inclusive suas fundações, das entidades sindicais dos trabalhadores, das instituições de educação e de assistência social, sem fins lucrativos, atendidos os requisitos da lei (CF88, Art 150, VI, c);
            4 - Livros, jornais, periódicos e o papel destinado a sua impressão (CF88, Art 150, VI, d);
            5 - Fonogramas e videofonogramas musicais produzidos no Brasil contendo obras musicais ou literomusicais de autores brasileiros e/ou obras em geral interpretadas por artistas brasileiros bem como os suportes materiais ou arquivos digitais que os contenham, salvo na etapa de replicação industrial de mídias ópticas de leitura a laser.   (CF88, Art 150, VI, e);
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="exigSusp" type="TCExigSuspensa" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Informações para a suspensão da Exigibilidade do ISSQN
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="BM" type="TCBeneficioMunicipal" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Tributação do ISSQN sobre o serviço prestado:
            1 - Operação tributável;
            2 - Exportação de serviço;
            3 - Não Incidência;
            4 - Imunidade;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="tpRetISSQN" type="TSTipoRetISSQN">
        <xs:annotation>
          <xs:documentation>
            Tipo de retencao do ISSQN:
            1 - Não Retido;
            2 - Retido pelo Tomador;
            3 - Retido pelo Intermediario;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pAliq" type="TSDec1V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor da alíquota (%) do serviço prestado relativo ao município sujeito ativo (município de incidência) do ISSQN.
            Se o município de incidência pertence ao Sistema Nacional NFS-e a alíquota estará parametrizada e, portanto, será fornecida pelo sistema.
            Se o município de incidência não pertence ao Sistema Nacional NFS-e a alíquota não estará parametrizada e, por isso, deverá ser fornecida pelo emitente.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE BENEFÍCIO MUNICIPAL-->
  <xs:complexType name="TCBeneficioMunicipal">
    <xs:sequence>
      <xs:element name="nBM" type="TSNumBeneficioMunicipal">
        <xs:annotation>
          <xs:documentation>
            Identificador do benefício parametrizado pelo município.

            Trata-se de um identificador único que foi gerado pelo Sistema Nacional no momento em que o município de incidência do ISSQN incluiu o benefício no sistema.
            
            Critério de formação do número de identificação de parâmetros municipais:
            7 dígitos - posição 1 a 7: número identificador do Município, conforme código IBGE;
            2 dígitos - posições 8 e 9 : número identificador do tipo de parametrização (01-legislação, 02-regimes especiais, 03-retenções, 04-outros benefícios);
            5 dígitos - posição 10 a 14 : número sequencial definido pelo sistema quando do registro específico do parâmetro dentro do tipo de parametrização no sistema;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:choice>
        <xs:element name="vRedBCBM" type="TSDec15V2" minOccurs="0">
          <xs:annotation>
            <xs:documentation>
              Valor monetário informado pelo emitente para redução da base de cálculo (BC) do ISSQN devido a um Benefício Municipal (BM).
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="pRedBCBM" type="TSDec3V2" minOccurs="0">
          <xs:annotation>
            <xs:documentation>
              Valor percentual informado pelo emitente para redução da base de cálculo (BC) do ISSQN devido a um Benefício Municipal (BM).
            </xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE EXIGIBILIDADE SUSPENSA -->
  <xs:complexType name="TCExigSuspensa">
    <xs:sequence>
      <xs:element name="tpSusp" type="TSOpExigSuspensa">
        <xs:annotation>
          <xs:documentation>
            Opção para Exigibilidade Suspensa:
            1 - Exigibilidade Suspensa por Decisão Judicial;
            2 - Exigibilidade Suspensa por Processo Administrativo;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nProcesso" type="TSNumProcExigSuspensa">
        <xs:annotation>
          <xs:documentation>
            Número do processo judicial ou administrativo de suspensão da exigibilidade
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE TRIBUTAÇÃO ESPECÍFICA PARA OUTROS TRIBUTOS-->
  <xs:complexType name="TCTribFederal">
    <xs:sequence>
      <xs:element name="piscofins" type="TCTribOutrosPisCofins" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações dos tributos PIS/COFINS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vRetCP" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor monetário do CP(R$).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vRetIRRF" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor monetário do IRRF (R$).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vRetCSLL" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor monetário do CSLL (R$).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE TRIBUTAÇÃO ESPECÍFICA PARA OUTROS TRIBUTOS DO TIPO PIS/COFINS-->
  <xs:complexType name="TCTribOutrosPisCofins">
    <xs:sequence>
      <xs:element name="CST" type="TSTipoCST">
        <xs:annotation>
          <xs:documentation>
            Código de Situação Tributária do PIS/COFINS (CST):
            00 - Nenhum;      
            01 - Operação Tributável com Alíquota Básica;
            02 - Operação Tributável com Alíquota Diferenciada;
            03 - Operação Tributável com Alíquota por Unidade de Medida de Produto;
            04 - Operação Tributável monofásica - Revenda a Alíquota Zero;
            05 - Operação Tributável por Substituição Tributária;
            06 - Operação Tributável a Alíquota Zero;
            07 - Operação Tributável da Contribuição;
            08 - Operação sem Incidência da Contribuição;
            09 - Operação com Suspensão da Contribuição;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vBCPisCofins" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor da Base de Cálculo do PIS/COFINS (R$).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pAliqPis" type="TSDec2V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor da Alíquota do PIS (%).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pAliqCofins" type="TSDec2V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor da Alíquota da COFINS (%).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vPis" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor monetário do PIS (R$).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vCofins" type="TSDec15V2" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Valor monetário do COFINS (R$).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="tpRetPisCofins" type="TSTipoRetPISCofins" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Tipo de retencao do Pis/Cofins:
            1 - Retido;
            2 - Não Retido;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE TRIBUTAÇÃO ESPECÍFICA PARA TOTAL DOS TRIBUTOS-->
  <xs:complexType name="TCTribTotal">
    <xs:sequence>
      <xs:choice>
        <xs:element name="vTotTrib" type="TCTribTotalMonet">
          <xs:annotation>
            <xs:documentation>
              Valor monetário total aproximado dos tributos, em conformidade com o artigo 1o da Lei no 12.741/2012
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="pTotTrib" type="TCTribTotalPercent">
          <xs:annotation>
            <xs:documentation>
              Valor percentual total aproximado dos tributos, em conformidade com o artigo 1o da Lei no 12.741/2012
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="indTotTrib" type="TSTipoIndTotTrib">
          <xs:annotation>
            <xs:documentation>
              Indicador de informação de valor total de tributos. Possui valor fixo igual a zero (indTotTrib=0).
              Não informar nenhum valor estimado para os Tributos (Decreto 8.264/2014).
              0 - Não;
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="pTotTribSN" type="TSDec2V2">
          <xs:annotation>
            <xs:documentation>
              Valor percentual aproximado do total dos tributos da alíquota do Simples Nacional (%)
            </xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE TRIBUTAÇÃO ESPECÍFICA PARA TOTAL DOS TRIBUTOS-->
  <xs:complexType name="TCTribTotalMonet">
    <xs:sequence>
      <xs:element name="vTotTribFed" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor monetário total aproximado dos tributos federais (R$).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vTotTribEst" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor monetário total aproximado dos tributos estaduais (R$).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vTotTribMun" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor monetário total aproximado dos tributos municipais (R$).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DE TRIBUTAÇÃO ESPECÍFICA PARA TOTAL DOS TRIBUTOS-->
  <xs:complexType name="TCTribTotalPercent">
    <xs:sequence>
      <xs:element name="pTotTribFed" type="TSDec3V2">
        <xs:annotation>
          <xs:documentation>
            Valor percentual total aproximado dos tributos federais (%).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pTotTribEst" type="TSDec3V2">
        <xs:annotation>
          <xs:documentation>
            Valor percentual total aproximado dos tributos estaduais (%).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pTotTribMun" type="TSDec3V2">
        <xs:annotation>
          <xs:documentation>
            Valor percentual total aproximado dos tributos municipais (%).
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DECLARADAS REFERENTES A IBS/CBS-->
  <xs:complexType name="TCRTCInfoIBSCBS">
    <xs:sequence>
      <xs:element name="finNFSe" type="TSRTCFinNFSe">
        <xs:annotation>
          <xs:documentation>
            Indicador da finalidade da emissão de NFS-e
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="indFinal" type="TSRTCIndFinal">
        <xs:annotation>
          <xs:documentation>
            Indica operação de uso ou consumo pessoal (art. 57)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cIndOp" type="TSRTCCodIndOp">
        <xs:annotation>
          <xs:documentation>
            Código indicador da operação de fornecimento, conforme tabela "código indicador de operação"
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="tpOper" type="TSRTCTpOper" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Tipo de Operação com Entes Governamentais ou outros serviços sobre bens imóveis
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="gRefNFSe" type="TCInfoRefNFSe" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de NFS-e referenciadas
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="tpEnteGov" type="TSRTCTpEnteGov" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Tipo de ente governamental
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="indDest" type="TSRTCIndDest">
        <xs:annotation>
          <xs:documentation>
            A respeito do Destinatário dos serviços
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="dest" type="TCRTCInfoDest" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relativas ao Destinatário
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="imovel" type="TCRTCInfoImovel" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações de operações relacionadas a bens imóveis, exceto obras
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="valores" type="TCRTCInfoValoresIBSCBS">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relativas aos valores do serviço prestado para IBS e CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA GRUPO DE NFS-E REFERENCIADAS-->
  <xs:complexType name="TCInfoRefNFSe">
    <xs:sequence>
      <xs:element name="refNFSe" type="TSChaveNFSe" maxOccurs="99">
        <xs:annotation>
          <xs:documentation>
            Chave da NFS-e referenciada
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>  
  <!--TIPO COMPLEXO INFORMAÇÕES RELATIVAS AO DESTINATÁRIO DO SERVIÇO IBSCBS-->
  <xs:complexType name="TCRTCInfoDest">
    <xs:sequence>
      <xs:choice>
        <xs:element name="CNPJ" type="TSCNPJ">
          <xs:annotation>
            <xs:documentation>
              Número da inscrição no Cadastro Nacional de Pessoa Jurídica (CNPJ) do Destinatário do serviço
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="CPF" type="TSCPF">
          <xs:annotation>
            <xs:documentation>
              Número da inscrição no Cadastro de Pessoa Física (CPF) do Destinatário do serviço
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="NIF" type="TSNIF">
          <xs:annotation>
            <xs:documentation>
              Número de Identificação Fiscal fornecido por órgão de administração tributária no exterior
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="cNaoNIF" type="TSCodNaoNIF">
          <xs:annotation>
            <xs:documentation>
              Motivo para não informação do NIF:
              0 - Não informado na nota de origem;
              1 - Dispensado do NIF;
              2 - Não exigência do NIF;
            </xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
      <xs:element name="xNome" type="TSDesc150">
        <xs:annotation>
          <xs:documentation>
            Nome / Nome Empresarial do do Destinatário do serviço
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="end" type="TCEndereco" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações do endereço do Destinatário do serviço
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="fone" type="TSTelefone" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Número do telefone do Destinatário do serviço
            (Preencher com o Código DDD + número do telefone. Nas operações com exterior é permitido informar o
            código do país + código da localidade + número do telefone)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="email" type="TSEmail" minOccurs="0">
        <xs:annotation>
          <xs:documentation>E-mail do Destinatário do serviço</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES RELATIVAS A BENS IMÓVEIS IBSCBS-->
  <xs:complexType name="TCRTCInfoImovel">
    <xs:sequence>
      <xs:element name="inscImobFisc" type="TSInscImobFisc" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Inscrição imobiliária fiscal (código fornecido pela Prefeitura Municipal para a identificação da obra ou para fins de recolhimento do IPTU)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:choice minOccurs="1">
        <xs:element name="cCIB" type="TSCodCIB">
          <xs:annotation>
            <xs:documentation>
              Código do Cadastro Imobiliário Brasileiro - CIB
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="end" type="TCEnderObraEvento">
          <xs:annotation>
            <xs:documentation>
              Grupo de informações do endereço da obra do serviço prestado
            </xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES RELATIVAS AOS VALORES DO SERVIÇO PRESTADO IBSCBS-->
  <xs:complexType name="TCRTCInfoValoresIBSCBS">
    <xs:sequence>
      <xs:element name="gReeRepRes" type="TCRTCInfoReeRepRes" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relativas a valores incluídos neste documento e recebidos por motivo de estarem relacionadas 
            a operações de terceiros, objeto de reembolso, repasse ou ressarcimento pelo recebedor, já tributados e aqui referenciados
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="trib" type="TCRTCInfoTributosIBSCBS">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relacionados aos tributos IBS e CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES RELATIVAS AOS VALORES DE REEMBOLSO REPASSE OU RESSARCIMENTO IBSCBS-->
  <xs:complexType name="TCRTCInfoReeRepRes">
    <xs:sequence>
      <xs:element name="documentos" type="TCRTCListaDoc" minOccurs="1" maxOccurs="1000">
        <xs:annotation>
          <xs:documentation>
            Grupo relativo aos documentos referenciados nos casos de reembolso, repasse e ressarcimento que serão 
            considerados na base de cálculo do ISSQN, do IBS e da CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES RELACIONADOS AOS TRIBUTOS IBSCBS-->
  <xs:complexType name="TCRTCInfoTributosIBSCBS">
    <xs:sequence>
      <xs:element name="gIBSCBS" type="TCRTCInfoTributosSitClas">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relacionadas ao IBS e à CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES RELATIVAS AOS DOCUMENTOS REFERENCIADOS NO REEMBOLSO REPASSE OU RESSARCIMENTO IBSCBS-->
  <xs:complexType name="TCRTCListaDoc">
    <xs:sequence>
      <xs:choice>
        <xs:element name="dFeNacional" type="TCRTCListaDocDFe">
          <xs:annotation>
            <xs:documentation>
              Grupo de informações de documentos fiscais eletrônicos que se encontram no repositório nacional
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="docFiscalOutro" type="TCRTCListaDocFiscalOutro">
          <xs:annotation>
            <xs:documentation>
              Grupo de informações de documento fiscais, eletrônicos ou não, que não se encontram no repositório nacional
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="docOutro" type="TCRTCListaDocOutro">
          <xs:annotation>
            <xs:documentation>
              Grupo de informações de documento não fiscal.
            </xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
      <xs:element name="fornec" type="TCRTCListaDocFornec" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações do fornecedor do documento referenciado
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="dtEmiDoc" type="TSData">
        <xs:annotation>
          <xs:documentation>
            Data da emissão do documento dedutível
            Ano, mês e dia (AAAA-MM-DD)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="dtCompDoc" type="TSData">
        <xs:annotation>
          <xs:documentation>
            Data da competência do documento dedutível
            Ano, mês e dia (AAAA-MM-DD)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="tpReeRepRes" type="TSRTCTpReeRepRes">
        <xs:annotation>
          <xs:documentation>
            Tipo de valor incluído neste documento, recebido por motivo de estarem relacionadas a operações de terceiros, 
            objeto de reembolso, repasse ou ressarcimento pelo recebedor, já tributados e aqui referenciados
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xTpReeRepRes" type="TSDesc150" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Descrição do reembolso ou ressarcimento quando a opção é 
            "99 – Outros reembolsos ou ressarcimentos recebidos por valores pagos relativos a operações por conta e ordem de terceiro"
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="vlrReeRepRes" type="TSDec15V2">
        <xs:annotation>
          <xs:documentation>
            Valor monetário (total ou parcial, conforme documento informado) utilizado para não inclusão na base de cálculo 
            do ISS e do IBS e da CBS da NFS-e que está sendo emitida (R$)
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES DE DOCUMENTOS FISCAIS ELETRÔNICOS QUE SE ENCONTRAM NO REPOSITÓRIO NACIONAL-->
  <xs:complexType name="TCRTCListaDocDFe">
    <xs:sequence>
      <xs:element name="tipoChaveDFe" type="TSRTCTipoChaveDFe">
        <xs:annotation>
          <xs:documentation>
            Documento fiscal a que se refere a chaveDfe que seja um dos documentos do Repositório Nacional
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xTipoChaveDFe" type="TSDesc255" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Descrição da DF-e a que se refere a chaveDfe que seja um dos documentos do Repositório Nacional
            Deve ser preenchido apenas quando "tipoChaveDFe = 9 (Outro)"
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="chaveDFe" type="TSRTCChaveDFe">
        <xs:annotation>
          <xs:documentation>
            Chave do Documento Fiscal eletrônico do repositório nacional referenciado para os casos de operações já tributadas
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES DE DOCUMENTO FISCAIS, ELETRÔNICOS OU NÃO, QUE NÃO SE ENCONTRAM NO REPOSITÓRIO NACIONAL-->
  <xs:complexType name="TCRTCListaDocFiscalOutro">
    <xs:sequence>
      <xs:element name="cMunDocFiscal" type="TSNum7Dig">
        <xs:annotation>
          <xs:documentation>
            Código do município emissor do documento fiscal que não se encontra no repositório nacional
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nDocFiscal" type="TSDesc255">
        <xs:annotation>
          <xs:documentation>
            Número do documento fiscal que não se encontra no repositório nacional
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xDocFiscal" type="TSDesc255">
        <xs:annotation>
          <xs:documentation>
            Descrição do documento fiscal
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES DE DOCUMENTO NÃO FISCAL-->
  <xs:complexType name="TCRTCListaDocOutro">
    <xs:sequence>
      <xs:element name="nDoc" type="TSDesc255">
        <xs:annotation>
          <xs:documentation>
            Número do documento não fiscal
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xDoc" type="TSDesc255">
        <xs:annotation>
          <xs:documentation>
            Descrição do documento não fiscal
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES DO FORNECEDOR DO DOCUMENTO REFERENCIADO-->
  <xs:complexType name="TCRTCListaDocFornec">
    <xs:sequence>
      <xs:choice>
        <xs:element name="CNPJ" type="TSCNPJ">
          <xs:annotation>
            <xs:documentation>
              Número da inscrição no Cadastro Nacional de Pessoa Jurídica (CNPJ) do Fornecedor do serviço
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="CPF" type="TSCPF">
          <xs:annotation>
            <xs:documentation>
              Número da inscrição no Cadastro de Pessoa Física (CPF) do Fornecedor do serviço
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="NIF" type="TSNIF">
          <xs:annotation>
            <xs:documentation>
              Este elemento só deverá ser preenchido para fornecedores não residentes no Brasil
            </xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="cNaoNIF" type="TSCodNaoNIF">
          <xs:annotation>
            <xs:documentation>
              Motivo para não informação do NIF:
              0 - Não informado na nota de origem;
              1 - Dispensado do NIF;
              2 - Não exigência do NIF;
            </xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
      <xs:element name="xNome" type="TSDesc150">
        <xs:annotation>
          <xs:documentation>
            Nome / Razão Social do do Fornecedor do serviço
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES RELACIONADOS AOS TRIBUTOS SITUACAO E CLASSIFICACAO IBSCBS-->
  <xs:complexType name="TCRTCInfoTributosSitClas">
    <xs:sequence>
      <xs:element name="CST" type="TSRTCCodSitTrib">
        <xs:annotation>
          <xs:documentation>
            Código de Situação Tributária do IBS e da CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cClassTrib" type="TSRTCCodClassTrib">
        <xs:annotation>
          <xs:documentation>
            Código de Classificação Tributária do IBS e da CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cCredPres" type="TSRTCCodCredPres" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Código e Classificação do Crédito Presumido: IBS e CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="gTribRegular" type="TCRTCInfoTributosTribRegular" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações da Tributação Regular
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="gDif" type="TCRTCInfoTributosDif" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações relacionadas ao diferimento para IBS e CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES DA TRIBUTAÇÃO REGULAR-->
  <xs:complexType name="TCRTCInfoTributosTribRegular">
    <xs:sequence>
      <xs:element name="CSTReg" type="TSRTCCodSitTrib">
        <xs:annotation>
          <xs:documentation>
            Código de Situação Tributária do IBS e da CBS de tributação regular
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cClassTribReg" type="TSRTCCodClassTrib">
        <xs:annotation>
          <xs:documentation>
            Código da Classificação Tributária do IBS e da CBS de tributação regular
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES RELACIONADAS AO DIFERIMENTO PARA IBS E CBS-->
  <xs:complexType name="TCRTCInfoTributosDif">
    <xs:sequence>
      <xs:element name="pDifUF" type="TSDec3V2">
        <xs:annotation>
          <xs:documentation>
            Percentual de diferimento para o IBS estadual
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pDifMun" type="TSDec3V2">
        <xs:annotation>
          <xs:documentation>
            Percentual de diferimento para o IBS municipal
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pDifCBS" type="TSDec3V2">
        <xs:annotation>
          <xs:documentation>
            Percentual de diferimento para a CBS
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`,
  },
  {
    fileName: "tiposEventos_v1.01.xsd",
    contents: `﻿<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
           targetNamespace="http://www.sped.fazenda.gov.br/nfse"
           xmlns="http://www.sped.fazenda.gov.br/nfse"
           attributeFormDefault="unqualified"
           elementFormDefault="qualified">
  <xs:import namespace="http://www.w3.org/2000/09/xmldsig#" schemaLocation="xmldsig-core-schema.xsd"/>
  <xs:include schemaLocation="tiposComplexos_v1.01.xsd"/>
  <!--TIPO COMPLEXO PARA EVENTO -->
  <xs:complexType name="TCEvento">
    <xs:sequence>
      <xs:element name="infEvento" type="TCInfEvento"/>
      <xs:element ref="ds:Signature"/>
    </xs:sequence>
    <xs:attribute name="versao" type="TVerNFSe" use="required"/>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA INFORMAÇÕES DO EVENTO-->
  <xs:complexType name="TCInfEvento">
    <xs:sequence>
      <xs:element name="verAplic" type="TSVerAplic" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Versão do aplicativo que gerou o pedido do evento.</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="ambGer" type="TSAmbGeradorEvt">
        <xs:annotation>
          <xs:documentation>Ambiente gerador do evento</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nSeqEvento" type="TSNum3Dig">
        <xs:annotation>
          <xs:documentation>Sequencial do evento para o mesmo tipo de evento. Para maioria dos eventos nSeqEvento=1. Nos casos em que possa existir mais de um evento do mesmo tipo o ambiente gerador deverá numerar de forma sequencial.</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="dhProc" type="TSDateTimeUTC">
        <xs:annotation>
          <xs:documentation>
            Data/Hora do registro do evento.
            Data e hora no formato UTC (Universal Coordinated Time): AAAA-MM-DDThh:mm:ssTZD"
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nDFe" type="TSNumDFe">
        <xs:annotation>
          <xs:documentation>Ambiente gerador do evento</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="pedRegEvento" type="TCPedRegEvt">
        <xs:annotation>
          <xs:documentation>Leiaute do pedido de registro do evento gerado pelo autor do evento</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
    <xs:attribute name="Id" type="TSIdEvento" use="required"/>
  </xs:complexType>
  <!--TIPO COMPLEXO PEDIDO DE REGISTRO DE EVENTO -->
  <xs:complexType name="TCPedRegEvt">
    <xs:sequence>
      <xs:element name="infPedReg" type="TCInfPedReg"/>
      <xs:element ref="ds:Signature" minOccurs="0"/>
    </xs:sequence>
    <xs:attribute name="versao" type="TVerNFSe" use="required"/>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA AS INFORMAÇÕES DO PEDIDO DE REGISTRO DE EVENTO -->
  <xs:complexType name="TCInfPedReg">
    <xs:sequence>
      <xs:element name="tpAmb" type="TSTipoAmbiente">
        <xs:annotation>
          <xs:documentation>Identificação do Ambiente: 1 - Produção; 2 - Homologação</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="verAplic" type="TSVerAplic">
        <xs:annotation>
          <xs:documentation>Versão do aplicativo que gerou o pedido de registro de evento.</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="dhEvento" type="TSDateTimeUTC">
        <xs:annotation>
          <xs:documentation>
            Data e hora do evento no formato AAAA-MM-DDThh:mm:ssTZD (UTC - Universal Coordinated Time, onde TZD pode ser -02:00 (Fernando de Noronha), -03:00 (Brasília) ou -04:00 (Manaus), no horário de verão serão -01:00, -02:00 e -03:00.
            Ex.: 2010-08-19T13:00:15-03:00.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:choice>
        <xs:annotation>
          <xs:documentation>Identificação do Autor do Pedido de Evento</xs:documentation>
        </xs:annotation>
        <xs:element name="CNPJAutor" type="TSCNPJ">
          <xs:annotation>
            <xs:documentation>CNPJ do autor do evento.</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="CPFAutor" type="TSCPF">
          <xs:annotation>
            <xs:documentation>CPF do autor do evento.</xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
      <xs:element name="chNFSe" type="TSChaveNFSe">
        <xs:annotation>
          <xs:documentation>Chave de Acesso da NFS-e vinculada ao Evento</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nPedRegEvento" type="TSNum3Dig">
        <xs:annotation>
          <xs:documentation>
            Número do pedido do registro de evento para o mesmo tipo de evento.
            Para os eventos que ocorrem somente uma vez, como é o caso do cancelamento, o nPedRegEvento deve ser igual a 1.
            Os eventos que podem ocorrer mais de uma vez devem ter o nPedRegEvento único.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:choice>
        <xs:element name="e101101" type="TE101101">
          <xs:annotation>
            <xs:documentation>Evento de cancelamento</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e105102" type="TE105102">
          <xs:annotation>
            <xs:documentation>Evento de cancelamento por substituição</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e101103" type="TE101103">
          <xs:annotation>
            <xs:documentation>Solicitação de Análise Fiscal para Cancelamento de NFS-e</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e105104" type="TE105104">
          <xs:annotation>
            <xs:documentation>Cancelamento de NFS-e Deferido por Análise Fiscal</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e105105" type="TE105105">
          <xs:annotation>
            <xs:documentation>Cancelamento de NFS-e Indeferido por Análise Fiscal</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e202201" type="TE202201">
          <xs:annotation>
            <xs:documentation>Confirmação do Prestador</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e203202" type="TE203202">
          <xs:annotation>
            <xs:documentation>Confirmação do Tomador</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e204203" type="TE204203">
          <xs:annotation>
            <xs:documentation>Confirmação do Intermediário</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e205204" type="TE205204">
          <xs:annotation>
            <xs:documentation>Confirmação Tácita</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e202205" type="TE202205">
          <xs:annotation>
            <xs:documentation>Rejeição do Prestador</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e203206" type="TE203206">
          <xs:annotation>
            <xs:documentation>Rejeição do Tomador</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e204207" type="TE204207">
          <xs:annotation>
            <xs:documentation>Rejeição do Intermediário</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e205208" type="TE205208">
          <xs:annotation>
            <xs:documentation>Anulação da Rejeição</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e305101" type="TE305101">
          <xs:annotation>
            <xs:documentation>Cancelamento de NFS-e por Ofício</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e305102" type="TE305102">
          <xs:annotation>
            <xs:documentation>Bloqueio de NFS-e por Ofício</xs:documentation>
          </xs:annotation>
        </xs:element>
        <xs:element name="e305103" type="TE305103">
          <xs:annotation>
            <xs:documentation>Desbloqueio de NFS-e por Ofício</xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:choice>
    </xs:sequence>
    <xs:attribute name="Id" type="TSIdPedRefEvt" use="required"/>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE CANCELAMENTO-->
  <xs:complexType name="TE101101">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do Evento: Descrição do evento: "Cancelamento de NFS-e".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Cancelamento de NFS-e"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
      <xs:element name="cMotivo" type="TSCodJustCanc">
        <xs:annotation>
          <xs:documentation>Código de justificativa de cancelamento</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xMotivo" type="TSMotivo">
        <xs:annotation>
          <xs:documentation>Descrição para explicitar o motivo indicado neste evento</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE CANCELAMENTO POR SUBSTITUIÇÃO-->
  <xs:complexType name="TE105102">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do Evento: Descrição do evento: "Cancelamento de NFS-e por Substituição".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Cancelamento de NFS-e por Substituicao"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
      <xs:element name="cMotivo" type="TSCodJustSubst">
        <xs:annotation>
          <xs:documentation>Código de justificativa de cancelamento substituição</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xMotivo" type="TSMotivo" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Descrição para explicitar o motivo indicado neste evento</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="chSubstituta" type="TSChaveNFSe">
        <xs:annotation>
          <xs:documentation>Chave de Acesso da NFS-e substituta.</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE SOLICITAÇÃO DE ANÁLISE FISCAL PARA CANCELAMENTO DE NFS-E-->
  <xs:complexType name="TE101103">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Solicitação de Análise Fiscal para Cancelamento de NFS-e"
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Solicitacao de Analise Fiscal para Cancelamento de NFS-e"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
      <xs:element name="cMotivo" type="TSCodJustAnaliseFiscalCanc">
        <xs:annotation>
          <xs:documentation>Código do motivo da solicitação de análise fiscal para cancelamento de NFS-e:</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xMotivo" type="TSMotivo">
        <xs:annotation>
          <xs:documentation>Descrição para explicitar o motivo indicado neste evento</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE CANCELAMENTO DE NFS-E DEFERIDO POR ANÁLISE FISCAL-->
  <xs:complexType name="TE105104">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Cancelamento de NFS-e Deferido por Análise Fiscal"
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Cancelamento de NFS-e Deferido por Análise Fiscal"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
      <xs:element name="CPFAgTrib" type="TSCPF">
        <xs:annotation>
          <xs:documentation>
            CPF do agente da administração tributária municipal que efetuou o deferimento da  solicitação de análise fiscal para cancelamento de NFS-e.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nProcAdm" type="TSNumProcAdmAnaliseFiscalCanc" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Número do processo administrativo municipal vinculado à solicitação de análise fiscal para cancelamento de NFS-e.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cMotivo" type="TSCodJustAnaliseFiscalCancDef">
        <xs:annotation>
          <xs:documentation>
            Resposta da solicitação de análise fiscal para cancelamento de NFS-e:
            1 - Cancelamento de NFS-e Deferido.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xMotivo" type="TSMotivo">
        <xs:annotation>
          <xs:documentation>
            Descrição para explicitar o motivo indicado neste evento
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE CANCELAMENTO DE NFS-E INDEFERIDO POR ANÁLISE FISCAL-->
  <xs:complexType name="TE105105">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Cancelamento de NFS-e Indeferido por Análise Fiscal".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Cancelamento de NFS-e Indeferido por Análise Fiscal"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
      <xs:element name="CPFAgTrib" type="TSCPF">
        <xs:annotation>
          <xs:documentation>
            CPF do agente da administração tributária municipal que efetuou o indeferimento da solicitação de análise fiscal para cancelamento de NFS-e.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nProcAdm" type="TSNumProcAdmAnaliseFiscalCanc" minOccurs="0">
        <xs:annotation>
          <xs:documentation>
            Número do processo administrativo municipal vinculado à solicitação de análise fiscal para cancelamento de NFS-e.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="cMotivo" type="TSCodJustAnaliseFiscalCancIndef">
        <xs:annotation>
          <xs:documentation>
            Resposta da solicitação de análise fiscal para cancelamento de NFS-e:
            1 - Cancelamento de NFS-e Indeferido;
            2 - Cancelamento de NFS-e Indeferido Sem Análise de Mérito.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xMotivo" type="TSMotivo">
        <xs:annotation>
          <xs:documentation>Descrição para explicitar o motivo indicado neste evento</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE CONFIRMAÇÃO DO PRESTADOR-->
  <xs:complexType name="TE202201">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Confirmação do Prestador".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Confirmação do Prestador"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE CONFIRMAÇÃO DO TOMADOR-->
  <xs:complexType name="TE203202">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Confirmação do Tomador".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Confirmação do Tomador"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE CONFIRMAÇÃO DO INTERMEDIÁRIO-->
  <xs:complexType name="TE204203">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Confirmação do Intermediário".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Confirmação do Intermediário"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE CONFIRMAÇÃO TÁCITA-->
  <xs:complexType name="TE205204">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Confirmação Tácita".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Confirmação Tácita"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE REJEIÇÃO DO PRESTADOR-->
  <xs:complexType name="TE202205">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Rejeição do Prestador".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Rejeição do Prestador"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
      <xs:element name="infRej" type="TCInfoEventoRejeicao">
        <xs:annotation>
          <xs:documentation>
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE REJEIÇÃO DO TOMADOR-->
  <xs:complexType name="TE203206">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Rejeição do Tomador".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Rejeição do Tomador"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
      <xs:element name="infRej" type="TCInfoEventoRejeicao">
        <xs:annotation>
          <xs:documentation>
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE REJEIÇÃO DO INTERMEDIÁRIO-->
  <xs:complexType name="TE204207">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Rejeição do Intermediário".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Rejeição do Intermediário"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
      <xs:element name="infRej" type="TCInfoEventoRejeicao">
        <xs:annotation>
          <xs:documentation>
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE ANULAÇÃO DE REJEIÇÃO-->
  <xs:complexType name="TE205208">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Anulação da Rejeição".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Anulação da Rejeição"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
      <xs:element name="infAnRej" type="TCInfoEventoAnulacaoRejeicao">
        <xs:annotation>
          <xs:documentation>
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE CANCELAMENTO POR OFÍCIO DA NFS-E--> 
  <xs:complexType name="TE305101">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Cancelamento de NFS-e por Ofício".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Cancelamento de NFS-e por Ofício"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
      <xs:element name="CPFAgTrib" type="TSCPF">
        <xs:annotation>
          <xs:documentation>
            CPF do agente da administração tributária municipal que efetuou o cancelamento por ofício de NFS-e.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="nProcAdm" type="TSNumProcAdmAnaliseFiscalCanc">
        <xs:annotation>
          <xs:documentation>
            Número do processo administrativo municipal vinculado ao cancelamento de NFS-e por ofício.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xProcAdm" type="TSMotivo">
        <xs:annotation>
          <xs:documentation>
            Descrição para explicitar o motivo indicado neste evento.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE BLOQUEIO POR OFÍCIO DA NFS-E--> 
  <xs:complexType name="TE305102">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Bloqueio de NFS-e por Ofício".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Bloqueio de NFS-e por Ofício"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
      <xs:element name="CPFAgTrib" type="TSCPF">
        <xs:annotation>
          <xs:documentation>
            CPF do agente da administração tributária municipal que efetuou o cancelamento por ofício de NFS-e.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xMotivo" type="TSMotivo">
        <xs:annotation>
          <xs:documentation>Descrição para explicitar o motivo indicado neste evento</xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="codEvento" type="TSCodigoEventoNFSe">
        <xs:annotation>
          <xs:documentation>Descrição para explicitar o motivo indicado neste evento</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO PARA O EVENTO DE DESBLOQUEIO POR OFÍCIO DA NFS-E-->
  <xs:complexType name="TE305103">
    <xs:sequence>
      <xs:element name="xDesc">
        <xs:annotation>
          <xs:documentation>
            Descrição do evento: "Desbloqueio de NFS-e por Ofício".
          </xs:documentation>
        </xs:annotation>
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:whiteSpace value="preserve"/>
            <xs:enumeration value="Desbloqueio de NFS-e por Ofício"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:element>
      <xs:element name="CPFAgTrib" type="TSCPF">
        <xs:annotation>
          <xs:documentation>
            CPF do agente da administração tributária municipal que efetuou o cancelamento por ofício de NFS-e.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="idBloqOfic" type="TSIdNumEvento">
        <xs:annotation>
          <xs:documentation>
            Referência ao Id da "Manifestação de rejeição da NFS-e" que originou o presente evento de anulação.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO LISTA DE EVENTOS--> 
  <xs:complexType name="TCListaEventos">
    <xs:sequence>
      <xs:element name="codEvento" type="TSCodigoEventoNFSe" maxOccurs="9">
        <xs:annotation>
          <xs:documentation>
            Grupo de informações de documento utilizado para Dedução/Redução do valor do serviço
          </xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES DO EVENTO DE REJEIÇÃO DA NFS-E-->
  <xs:complexType name="TCInfoEventoRejeicao">
    <xs:sequence>
      <xs:element name="cMotivo" type="TSCodMotivoRejeicao">
        <xs:annotation>
          <xs:documentation>
            Motivo da Rejeição da NFS-e:
            1 - NFS-e em duplicidade;
            2 - NFS-e já emitida pelo tomador;
            3 - Não ocorrência do fato gerador;
            4 - Erro quanto a responsabilidade tributária;
            5 - Erro quanto ao valor do serviço, valor das deduções ou serviço prestado ou data do fato gerador;
            9 - Outros;
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xMotivo" type="TSMotivo" minOccurs="0">
        <xs:annotation>
          <xs:documentation>Descrição para explicitar o motivo indicado neste evento</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
  <!--TIPO COMPLEXO INFORMAÇÕES DO EVENTO DE ANULAÇÃO DE REJEIÇÃO DA NFS-E-->
  <xs:complexType name="TCInfoEventoAnulacaoRejeicao">
    <xs:sequence>
      <xs:element name="CPFAgTrib" type="TSCPF">
        <xs:annotation>
          <xs:documentation>
            CPF do agente da administração tributária municipal que efetuou o anulação da manifestação de rejeição da NFS-e.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="idEvManifRej" type="TSIdNumEvento">
        <xs:annotation>
          <xs:documentation>
            Referência ao Id da "Manifestação de rejeição da NFS-e" que originou o presente evento de anulação.
          </xs:documentation>
        </xs:annotation>
      </xs:element>
      <xs:element name="xMotivo" type="TSMotivo">
        <xs:annotation>
          <xs:documentation>Descrição para explicitar o motivo da anluação</xs:documentation>
        </xs:annotation>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`,
  },
  {
    fileName: "tiposSimples_v1.01.xsd",
    contents: `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema attributeFormDefault="unqualified" elementFormDefault="qualified" targetNamespace="http://www.sped.fazenda.gov.br/nfse" xmlns="http://www.sped.fazenda.gov.br/nfse" xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="TVerNFSe">
    <xs:annotation>
      <xs:documentation>Tipo Versão da NF-e - 1.01</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="1\\.01"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TVerCNC">
    <xs:annotation>
      <xs:documentation>Tipo Versão do CNC - 1.00</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="1\\.00"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSString">
    <xs:annotation>
      <xs:documentation>Tipo string genérico</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[!-ÿ]{1}[ -ÿ]{0,}[!-ÿ]{1}|[!-ÿ]{1}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSStringComQuebraDeLinha">
    <xs:annotation>
      <xs:documentation>Tipo string genérico</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[\\s\\S!-ÿ]{1}[\\s\\S -ÿ]{0,}[\\s\\S!-ÿ]{1}|[\\s\\S!-ÿ]{1}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSIdNFSe">
    <xs:annotation>
      <xs:documentation>
        Informar o identificador precedido do literal ‘NFS’. A regra de formação do identificador de 53 posições da NFS-e é:
        "NFS" + Cód.Mun.(7) + Amb.Ger.(1) + Tipo de Inscrição Federal(1) + Inscrição Federal(14) + No.NFS-e(13) + AnoMes Emis.(4) + Cód.Num.(9) + DV(1)
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="53"/>
      <xs:pattern value="NFS[0-9]{50}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSIdDPS">
    <xs:annotation>
      <xs:documentation>
        Informar o identificador precedido do literal ‘DPS’. A regra de formação do identificador de 45 posições da DPS é:
        "DPS" + Cód.Mun (7) + Tipo de Inscrição Federal (1) + Inscrição Federal (14 - CPF completar com 000 à esquerda) + Série DPS (5)+ Núm. DPS (15)
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="45"/>
      <xs:pattern value="DPS[0-9]{42}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSTipoAmbiente">
    <xs:annotation>
      <xs:documentation>
        Tipos de ambiente do Sistema Nacional NFS-e: 1 - Produção; 2 - Homologação;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSAmbGeradorNFSe">
    <xs:annotation>
      <xs:documentation>
        Tipo Ambiente Gerador de NFS-e:
        1 - Prefeitura;
        2 - Sistema Nacional da NFS-e;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSAmbGeradorEvt">
    <xs:annotation>
      <xs:documentation>
        Tipo Ambiente gerador do evento:
        1- Prefeitura;
        2- Sefin Nacional;
        3- Ambiente Nacional.
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSTipoEmissao">
    <xs:annotation>
      <xs:documentation>
        Tipo de emissão da NFS-e:
        1 - Emissão normal no modelo da NFS-e Nacional;
        2 - Emissão original em leiaute próprio do município com transcrição para o modelo da NFS-e Nacional.
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSProcEmissao">
    <xs:annotation>
      <xs:documentation>
        Processo de Emissão da DPS:
        1 - Emissão com aplicativo do contribuinte (via Web Service);
        2 - Emissão com aplicativo disponibilizado pelo fisco (Web);
        3 - Emissão com aplicativo disponibilizado pelo fisco (App);
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSData">
    <xs:annotation>
      <xs:documentation>Tipo data no formato AAAA-MM-DD</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="(((20(([02468][048])|([13579][26]))-02-29))|(20[0-9][0-9])-((((0[1-9])|(1[0-2]))-((0[1-9])|(1\\d)|(2[0-8])))|((((0[13578])|(1[02]))-31)|(((0[1,3-9])|(1[0-2]))-(29|30)))))"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDateTimeUTC">
    <xs:annotation>
      <xs:documentation>Data e Hora, formato UTC (AAAA-MM-DDThh:mm:ssTZD, onde TZD = +hh:mm ou -hh:mm)</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="(((20(([02468][048])|([13579][26]))-02-29))|(20[0-9][0-9])-((((0[1-9])|(1[0-2]))-((0[1-9])|(1\\d)|(2[0-8])))|((((0[13578])|(1[02]))-31)|(((0[1,3-9])|(1[0-2]))-(29|30)))))T(20|21|22|23|[0-1]\\d):[0-5]\\d:[0-5]\\d([\\-,\\+](0[0-9]|10|11):00|([\\+](12):00))"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSVerAplic">
    <xs:annotation>
      <xs:documentation>Tipo Versão do Aplicativo que gerou o documento fiscal</xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="20"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSSerieDPS">
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="5"/>
      <xs:pattern value="[0-9]{1,5}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSEmitenteDPS">
    <xs:annotation>
      <xs:documentation>
        Emitente da DPS:
        1 - Prestador
        2 - Tomador
        3 - Intermediário
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSMotivoEmisTI">
    <xs:annotation>
      <xs:documentation>
        Motivo da Emissão da DPS pelo Tomador/Intermediário:
        1 - Importação de Serviço;
        2 - Tomador/Intermediário obrigado a emitir NFS-e por legislação municipal;
        3 - Tomador/Intermediário emitindo NFS-e por recusa de emissão pelo prestador;
        4 - Tomador/Intermediário emitindo por rejeitar a NFS-e emitida pelo prestador;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
      <xs:enumeration value="4"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSChaveNFSe">
    <xs:annotation>
      <xs:documentation>Tipo Chave da Nota Fiscal de Serviço Eletrônica</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="50"/>
      <xs:pattern value="[0-9]{50}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSChaveNFe">
    <xs:annotation>
      <xs:documentation>Tipo Chave da Nota Fiscal Eletrônica - NF-e</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="44"/>
      <xs:pattern value="[0-9]{44}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodJustCanc">
    <xs:annotation>
      <xs:documentation>
        Código de justificativa de cancelamento:
        1 - Erro na Emissão;
        2 - Serviço não Prestado;
        9 - Outros;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="9"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodJustSubst">
    <xs:annotation>
      <xs:documentation>
        Código de justificativa para substituição de NFS-e:
        01 - Desenquadramento de NFS-e do Simples Nacional;
        02 - Enquadramento de NFS-e no Simples Nacional;
        03 - Inclusão Retroativa de Imunidade/Isenção para NFS-e;
        04 - Exclusão Retroativa de Imunidade/Isenção para NFS-e;
        05 - Rejeição de NFS-e pelo tomador ou pelo intermediário se responsável pelo recolhimento do tributo;
        99 - Outros;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="01"/>
      <xs:enumeration value="02"/>
      <xs:enumeration value="03"/>
      <xs:enumeration value="04"/>
      <xs:enumeration value="05"/>
      <xs:enumeration value="99"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodJustAnaliseFiscalCanc">
    <xs:annotation>
      <xs:documentation>
        Código do motivo da solicitação de análise fiscal para cancelamento de NFS-e:
        1 - Erro na Emissão;
        2 - Serviço não Prestado;
        3 - Outros.
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="9"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodMotivoRejeicao">
    <xs:annotation>
      <xs:documentation>
        Motivo da Rejeição da NFS-e:
        1 - NFS-e em duplicidade;
        2 - NFS-e já emitida pelo tomador;
        3 - Não ocorrência do fato gerador;
        4 - Erro quanto a responsabilidade tributária;
        5 - Erro quanto ao valor do serviço, valor das deduções ou serviço prestado ou data do fato gerador;
        9 - Outros;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
      <xs:enumeration value="4"/>
      <xs:enumeration value="5"/>
      <xs:enumeration value="9"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodJustAnaliseFiscalCancDef">
    <xs:annotation>
      <xs:documentation>
        Resposta da análise da solicitação do cancelamento extemporâneo de NFS-e:
        1 - Cancelamento Extemporâneo Deferido.
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodJustAnaliseFiscalCancIndef">
    <xs:annotation>
      <xs:documentation>
        Resposta da análise da solicitação do cancelamento extemporâneo de NFS-e:
        1 - Cancelamento Extemporâneo Indeferido;
        2 - Cancelamento Extemporâneo Indeferido Sem Análise de Mérito.
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNumProcAdmAnaliseFiscalCanc">
    <xs:annotation>
      <xs:documentation>Número do processo administrativo municipal vinculado à solicitação de cancelamento extemporâneo de NFS-e.</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="30"/>
      <xs:pattern value="[0-9]{1,30}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodAutorManifestacao">
    <xs:annotation>
      <xs:documentation>
        Tipo do autor da manifestação da NFS-e:
        1 - Prestador;
        2 - Tomador;
        3 - Intermediário.
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSMotivo">
    <xs:annotation>
      <xs:documentation>Descrição do motivo da substituição da NFS-e</xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:minLength value="15"/>
      <xs:maxLength value="255"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCNPJ">
    <xs:annotation>
      <xs:documentation>Tipo Número do CNPJ</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="14"/>
      <xs:pattern value="[0-9]{14}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCPF">
    <xs:annotation>
      <xs:documentation>Tipo Número do CPF</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="11"/>
      <xs:pattern value="[0-9]{11}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCAEPF">
    <xs:annotation>
      <xs:documentation>Tipo Número do CAEPF</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="14"/>
      <xs:pattern value="[0-9]{14}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNIF">
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="40"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodNaoNIF">
    <xs:annotation>
      <xs:documentation>
        Motivo para não informação do NIF:
        0 - Não informado na nota de origem;
        1 - Dispensado do NIF;
        2 - Não exigência do NIF;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSInscMun">
    <xs:restriction base="xs:string">
      <xs:maxLength value="15"/>
      <xs:minLength value="1"/>
      <xs:whiteSpace value="preserve"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNomeRazaoSocial">
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="300"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNomeFantasia">
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="150"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSLogradouro">
    <xs:annotation>
      <xs:documentation>Logradouro</xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="255"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNumeroEndereco">
    <xs:annotation>
      <xs:documentation>Número</xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="60"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSComplementoEndereco">
    <xs:annotation>
      <xs:documentation>Complemento</xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="156"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSBairro">
    <xs:annotation>
      <xs:documentation>Bairro</xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="60"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSUF">
    <xs:annotation>
      <xs:documentation>Tipo Sigla da UF</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="AC"/>
      <xs:enumeration value="AL"/>
      <xs:enumeration value="AM"/>
      <xs:enumeration value="AP"/>
      <xs:enumeration value="BA"/>
      <xs:enumeration value="CE"/>
      <xs:enumeration value="DF"/>
      <xs:enumeration value="ES"/>
      <xs:enumeration value="GO"/>
      <xs:enumeration value="MA"/>
      <xs:enumeration value="MG"/>
      <xs:enumeration value="MS"/>
      <xs:enumeration value="MT"/>
      <xs:enumeration value="PA"/>
      <xs:enumeration value="PB"/>
      <xs:enumeration value="PE"/>
      <xs:enumeration value="PI"/>
      <xs:enumeration value="PR"/>
      <xs:enumeration value="RJ"/>
      <xs:enumeration value="RN"/>
      <xs:enumeration value="RO"/>
      <xs:enumeration value="RR"/>
      <xs:enumeration value="RS"/>
      <xs:enumeration value="SC"/>
      <xs:enumeration value="SE"/>
      <xs:enumeration value="SP"/>
      <xs:enumeration value="TO"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCEP">
    <xs:annotation>
      <xs:documentation>CEP</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{8}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodigoEndPostal">
    <xs:annotation>
      <xs:documentation>Código de enderaçamento postal</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="11"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCidade">
    <xs:annotation>
      <xs:documentation>Cidade</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="60"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSEstadoProvRegiao">
    <xs:annotation>
      <xs:documentation>Estado, província ou região</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="60"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSEnderCompletoExt">
    <xs:restriction base="TSString">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="255"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSTelefone">
    <xs:annotation>
      <xs:documentation>
        Número do telefone do prestador:
        Preencher com o Código DDD + número do telefone.
        Nas operações com exterior é permitido informar o código do país + código da localidade + número do telefone
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{6,20}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSEmail">
    <xs:restriction base="TSString">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="80"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TCCodTribMun">
    <xs:annotation>
      <xs:documentation>Código de tributação municipal do ISSQN</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{3}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodMoeda">
    <xs:annotation>
      <xs:documentation>Tipo com código que identifica a moeda conforme tabela do BACEN</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="3"/>
      <xs:pattern value="[0-9]{3}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSModoPrestacao">
    <xs:annotation>
      <xs:documentation>
        Modo de Prestação:
        0 - Desconhecido (tipo não informado na nota de origem);
        1 - Transfronteiriço;
        2 - Consumo no Brasil;
        3 - Presença Comercial no Exterior;
        4 - Movimento Temporário de Pessoas Físicas;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
      <xs:enumeration value="4"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSVincPrest">
    <xs:annotation>
      <xs:documentation>
        Vínculo entre as partes no negócio:
        0 - Sem vínculo com o Tomador/Prestador
        1 - Controlada;
        2 - Controladora;
        3 - Coligada;
        4 - Matriz;
        5 - Filial ou sucursal;
        6 - Outro vínculo;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
      <xs:enumeration value="4"/>
      <xs:enumeration value="5"/>
      <xs:enumeration value="6"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSMecAFComExPrest">
    <xs:annotation>
      <xs:documentation>
        Mecanismo de apoio/fomento ao Comércio Exterior utilizado pelo prestador do serviço:
        00 - Desconhecido (tipo não informado na nota de origem);
        01 - Nenhum;
        02 - ACC - Adiantamento sobre Contrato de Câmbio – Redução a Zero do IR e do IOF;
        03 - ACE – Adiantamento sobre Cambiais Entregues - Redução a Zero do IR e do IOF;
        04 - BNDES-Exim Pós-Embarque – Serviços;
        05 - BNDES-Exim Pré-Embarque - Serviços;
        06 - FGE - Fundo de Garantia à Exportação;
        07 - PROEX - EQUALIZAÇÃO
        08 - PROEX - Financiamento;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="00"/>
      <xs:enumeration value="01"/>
      <xs:enumeration value="02"/>
      <xs:enumeration value="03"/>
      <xs:enumeration value="04"/>
      <xs:enumeration value="05"/>
      <xs:enumeration value="06"/>
      <xs:enumeration value="07"/>
      <xs:enumeration value="08"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSMecAFComExToma">
    <xs:annotation>
      <xs:documentation>
        Mecanismo de apoio/fomento ao Comércio Exterior utilizado pelo tomador do serviço:
        00 - Desconhecido (tipo não informado na nota de origem);
        01 - Nenhum;
        02 - Adm. Pública e Repr. Internacional;
        03 - Alugueis e Arrend. Mercantil de maquinas, equip., embarc. e aeronaves;
        04 - Arrendamento Mercantil de aeronave para empresa de transporte aéreo público;
        05 - Comissão a agentes externos na exportação;
        06 - Despesas de armazenagem, mov. e transporte de carga no exterior;
        07 - Eventos FIFA (subsidiária);
        08 - Eventos FIFA;
        09 - Fretes, arrendamentos de embarcações ou aeronaves e outros;
        10 - Material Aeronáutico;
        11 - Promoção de Bens no Exterior;
        12 - Promoção de Dest. Turísticos Brasileiros;
        13 - Promoção do Brasil no Exterior;
        14 - Promoção Serviços no Exterior;
        15 - RECINE;
        16 - RECOPA;
        17 - Registro e Manutenção de marcas, patentes e cultivares;
        18 - REICOMP;
        19 - REIDI;
        20 - REPENEC;
        21 - REPES;
        22 - RETAERO; 
        23 - RETID;
        24 - Royalties, Assistência Técnica, Científica e Assemelhados;
        25 - Serviços de avaliação da conformidade vinculados aos Acordos da OMC;
        26 - ZPE;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="00"/>
      <xs:enumeration value="01"/>
      <xs:enumeration value="02"/>
      <xs:enumeration value="03"/>
      <xs:enumeration value="04"/>
      <xs:enumeration value="05"/>
      <xs:enumeration value="06"/>
      <xs:enumeration value="07"/>
      <xs:enumeration value="08"/>
      <xs:enumeration value="09"/>
      <xs:enumeration value="10"/>
      <xs:enumeration value="11"/>
      <xs:enumeration value="12"/>
      <xs:enumeration value="13"/>
      <xs:enumeration value="14"/>
      <xs:enumeration value="15"/>
      <xs:enumeration value="16"/>
      <xs:enumeration value="17"/>
      <xs:enumeration value="18"/>
      <xs:enumeration value="19"/>
      <xs:enumeration value="20"/>
      <xs:enumeration value="21"/>
      <xs:enumeration value="22"/>
      <xs:enumeration value="23"/>
      <xs:enumeration value="24"/>
      <xs:enumeration value="25"/>
      <xs:enumeration value="26"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSMovTempBens">
    <xs:annotation>
      <xs:documentation>
        Vínculo da Operação à Movimentação Temporária de Bens:
        0 - Desconhecido (tipo não informado na nota de origem);
        1 - Não;
        2 - Vinculada - Declaração de Importação;
        3 - Vinculada - Declaração de Exportação;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCategVeic">
    <xs:annotation>
      <xs:documentation>
        Categorias de veículos para cobrança:
        00 - Categoria de veículos (tipo não informado na nota de origem)
        01 - Automóvel, caminhonete e furgão;
        02 - Caminhão leve, ônibus, caminhão trator e furgão;
        03 - Automóvel e caminhonete com semireboque;
        04 - Caminhão, caminhão-trator, caminhão-trator com semi-reboque e ônibus;
        05 - Automóvel e caminhonete com reboque;
        06 - Caminhão com reboque;
        07 - Caminhão trator com semi-reboque;
        08 - Motocicletas, motonetas e bicicletas motorizadas;
        09 - Veículo especial;
        10 - Veículo Isento;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="00"/>
      <xs:enumeration value="01"/>
      <xs:enumeration value="02"/>
      <xs:enumeration value="03"/>
      <xs:enumeration value="04"/>
      <xs:enumeration value="05"/>
      <xs:enumeration value="06"/>
      <xs:enumeration value="07"/>
      <xs:enumeration value="08"/>
      <xs:enumeration value="09"/>
      <xs:enumeration value="10"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNumDocImport">
    <xs:annotation>
      <xs:documentation>Número da Declaração de Importação (DI/DSI/DA/DRI-E) averbado</xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="12"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNumRegExport">
    <xs:annotation>
      <xs:documentation>Número do Registro de Exportação (RE) averbado</xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="12"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSEnvMDIC">
    <xs:annotation>
      <xs:documentation>
        Compartilhar as informações da NFS-e gerada a partir desta DPS com a Secretaria de Comércio Exterior:
        0 - Não enviar para o MDIC;
        1 - Enviar para o MDIC;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
      <xs:enumeration value="1"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSPlaca">
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[A-Z]{2,3}[0-9]{4}|[A-Z]{3,4}[0-9]{3}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodAcessoPed">
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[a-zA-Z0-9]{10}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodContrato">
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[a-zA-Z0-9]{4}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNumEixos">
    <xs:annotation>
      <xs:documentation>Número de eixos para fins de cobrança</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{1,2}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRodagem">
    <xs:annotation>
      <xs:documentation>
        Tipo de rodagem:
        1 - Simples;
        2 - Dupla;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSSentido">
    <xs:annotation>
      <xs:documentation>Orientação de passagem do veículo: ângulo em graus a partir do norte geográfico em sentido horário, número inteiro de 0 a 359, onde 0º seria o norte, 90º o leste, 180º o sul, 270º o oeste. Precisão mínima de 10</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{1,3}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSIdeEvento">
    <xs:annotation>
      <xs:documentation>Identificação da Atividade de Evento (código identificador de evento determinado pela Administração Tributária Municipal)</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="30"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodObra">
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="30"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodCIB">
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:length value="8"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSInscImobFisc">
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="30"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDRT">
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="40"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDescInfCompl">
    <xs:restriction base="TSString">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="2000"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodVerificacao">
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="9"/>
      <xs:pattern value="[a-zA-Z0-9]{1,9}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSSerieNFNFS">
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="15"/>
      <xs:pattern value="[a-zA-Z0-9]{1,15}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSIdeDedRed">
    <xs:annotation>
      <xs:documentation>
	Identificação da Dedução/Redução:
        1 – Alimentação e bebidas/frigobar;
        2 – Materiais;
        5 – Repasse consorciado;
        6 – Repasse plano de saúde;
        7 – Serviços;
        8 – Subempreitada de mão de obra;
        99 – Outras deduções;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="5"/>
      <xs:enumeration value="6"/>
      <xs:enumeration value="7"/>
      <xs:enumeration value="8"/>
      <xs:enumeration value="99"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDescOutDedRed">
    <xs:annotation>
      <xs:documentation>Descrição da Dedução/Redução quando a opção é "99 – Outras Deduções"</xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="150"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNumBeneficioMunicipal">
    <xs:annotation>
      <xs:documentation>
        Identificador do benefício parametrizado pelo município.

        Trata-se de um identificador único que foi gerado pelo Sistema Nacional no momento em que o município de incidência do ISSQN incluiu o benefício no sistema.
        
        Critério de formação do número de identificação de parâmetros municipais:   
        7 dígitos - posição 1 a 7: número identificador do Município, conforme código IBGE;
        2 dígitos - posições 8 e 9 : número identificador do tipo de parametrização (01-legislação, 02-regimes especiais, 03-retenções, 04-outros benefícios);
        5 dígitos - posição 10 a 14 : número sequencial definido pelo sistema quando do registro específico do parâmetro dentro do tipo de parametrização no sistema;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:pattern value="[0-9]{14}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSOpExigSuspensa">
    <xs:annotation>
      <xs:documentation>
        Opção para Exigibilidade Suspensa:
        1 - Exigibilidade Suspensa por Decisão Judicial;
        2 - Exigibilidade Suspensa por Processo Administrativo;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNumProcExigSuspensa">
    <xs:annotation>
      <xs:documentation>Número do processo judicial ou administrativo de suspensão da exigibilidade</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:pattern value="[0-9]{30}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSOpSimpNac">
    <xs:annotation>
      <xs:documentation>
        Situação perante o Simples Nacional:
        1 - Não Optante;
        2 - Optante - Microempreendedor Individual (MEI);
        3 - Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP);
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRegimeApuracaoSimpNac">
    <xs:annotation>
      <xs:documentation>
        Opção para que o contribuinte optante pelo Simples Nacional ME/EPP (opSimpNac = 3) possa indicar, ao emitir o documento fiscal, em qual regime de apuração os tributos federais e municipal estão inseridos, caso tenha ultrapassado algum sublimite ou limite definido para o Simples Nacional.
        1 – Regime de apuração dos tributos federais e municipal pelo SN;
        2 – Regime de apuração dos tributos federais pelo SN e ISSQN  por fora do SN conforme respectiva legislação municipal do tributo;
        3 – Regime de apuração dos tributos federais e municipal por fora do SN conforme respectivas legilações federal e municipal de cada tributo;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSOpSNLimUltrap">
    <xs:annotation>
      <xs:documentation>
        Opção que indica se o limite do Simples Nacional foi ultrapassado:
        0 - Não ultrapassado;
        1 - Ultrapassado;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
      <xs:enumeration value="1"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRegEspTrib">
    <xs:annotation>
      <xs:documentation>
        Tipos de Regimes Especiais de Tributação:
        0 - Nenhum;
        1 - Ato Cooperado (Cooperativa);
        2 - Estimativa;
        3 - Microempresa Municipal;
        4 - Notário ou Registrador;
        5 - Profissional Autônomo;
        6 - Sociedade de Profissionais;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
      <xs:enumeration value="4"/>
      <xs:enumeration value="5"/>
      <xs:enumeration value="6"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSTribISSQN">
    <xs:annotation>
      <xs:documentation>
        Tributação do ISSQN sobre o serviço prestado:
        1 - Operação tributável;
        2 - Imunidade;
        3 - Exportação de serviço;
        4 - Não Incidência;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
      <xs:enumeration value="4"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNumProcesso">
    <xs:annotation>
      <xs:documentation>
        Número do processo judicial ou administrativo de suspensão da exigibilidade.
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="30"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSTipoImunidadeISSQN">
    <xs:annotation>
      <xs:documentation>
            Identificação da Imunidade do ISSQN – somente para o caso de Imunidade.

            Tipos de Imunidades:
            
            0 - Imunidade (tipo não informado na nota de origem);
            1 - Patrimônio, renda ou serviços, uns dos outros (CF88, Art 150, VI, a);
            2 - Templos de qualquer culto (CF88, Art 150, VI, b);
            3 - Patrimônio, renda ou serviços dos partidos políticos, inclusive suas fundações, das entidades sindicais dos trabalhadores, das instituições de educação e de assistência social, sem fins lucrativos, atendidos os requisitos da lei (CF88, Art 150, VI, c);
            4 - Livros, jornais, periódicos e o papel destinado a sua impressão (CF88, Art 150, VI, d);
            5 - Fonogramas e videofonogramas musicais produzidos no Brasil contendo obras musicais ou literomusicais de autores brasileiros e/ou obras em geral interpretadas por artistas brasileiros bem como os suportes materiais ou arquivos digitais que os contenham, salvo na etapa de replicação industrial de mídias ópticas de leitura a laser.   (CF88, Art 150, VI, e);
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
      <xs:enumeration value="4"/>
      <xs:enumeration value="5"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSTipoRetISSQN">
    <xs:annotation>
      <xs:documentation>
        Tipo de retencao do ISSQN:
        1 - Não Retido;
        2 - Retido pelo Tomador;
        3 - Retido pelo Intermediario;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSTipoCST">
    <xs:annotation>
      <xs:documentation>
        Código de Situação Tributária do PIS/COFINS (CST):
        00 - Nenhum;      
        01 - Operação Tributável com Alíquota Básica;
        02 - Operação Tributável com Alíquota Diferenciada;
        03 - Operação Tributável com Alíquota por Unidade de Medida de Produto;
        04 - Operação Tributável monofásica - Revenda a Alíquota Zero;
        05 - Operação Tributável por Substituição Tributária;
        06 - Operação Tributável a Alíquota Zero;
        07 - Operação Tributável da Contribuição;
        08 - Operação sem Incidência da Contribuição;
        09 - Operação com Suspensão da Contribuição;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="00"/>
      <xs:enumeration value="01"/>
      <xs:enumeration value="02"/>
      <xs:enumeration value="03"/>
      <xs:enumeration value="04"/>
      <xs:enumeration value="05"/>
      <xs:enumeration value="06"/>
      <xs:enumeration value="07"/>
      <xs:enumeration value="08"/>
      <xs:enumeration value="09"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSOpConsumServ">
    <xs:annotation>
      <xs:documentation>
        Opção para que o emitente informe onde ocorreu o consumo do serviço prestado.
        0 - Consumo do serviço prestado ocorrido no município do local da prestação;
        1 - Consumo do serviço prestado ocorrido ocorrido no exterior ;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
      <xs:enumeration value="1"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSTipoRetPISCofins">
    <xs:annotation>
      <xs:documentation>
        Tipo de retencao do Pis/Cofins:
        1 - Retido;
        2 - Não Retido;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSTipoIndTotTrib">
    <xs:annotation>
      <xs:documentation>
        Indicador de informação de valor total de tributos. Possui valor fixo igual a zero (indTotTrib=0).
        Não informar nenhum valor estimado para os Tributos (Decreto 8.264/2014).
        0 - Não;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TBMISSQN">
    <xs:annotation>
      <xs:documentation>
        Tipo Benefício Municipal (BM):
        1) Isenção;
        2) Redução da BC em 'ppBM' %;
        3) Redução da BC em R$ 'vInfoBM';
        4) Alíquota Diferenciada de 'aliqDifBM' %;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
    <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
      <xs:enumeration value="4"/>
	</xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TStat">
    <xs:annotation>
      <xs:documentation>
        Situações possíveis:
        100 - NFS-e Gerada;
        101 - NFS-e de Substituição Gerada;
        102 - NFS-e de Decisão Judicial;
        103 - NFS-e Avulsa;
        107 - NFS-e MEI;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="100"/>
      <xs:enumeration value="101"/>
      <xs:enumeration value="102"/>
      <xs:enumeration value="103"/>
      <xs:enumeration value="107"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNumDPS">
    <xs:annotation>
      <xs:documentation>Tipo Número do DPS</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="15"/>
      <xs:pattern value="[1-9]{1}[0-9]{0,14}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNNFSe">
    <xs:annotation>
      <xs:documentation>Tipo Número sequencial do documento</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="13"/>
      <xs:pattern value="[1-9]{1}[0-9]{0,12}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNDFSe">
    <xs:annotation>
      <xs:documentation>Tipo Número do DFS-e</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="13"/>
      <xs:pattern value="[1-9]{1}[0-9]{0,12}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodMunIBGE">
    <xs:annotation>
      <xs:documentation>Tipo Código do Município segundo tabela IBGE</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{7}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodPaisISO">
    <xs:annotation>
      <xs:documentation>Tipo Código do País segundo tabela ISO</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[A-Z]{2}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodTribNac">
    <xs:annotation>
      <xs:documentation>Código de tributação nacional do ISSQN:
        Regra de formação - 6 dígitos numéricos sendo: 2 para Item (LC 116/2003), 2 para Subitem (LC 116/2003) e 2 para Desdobro Nacional
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{6}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodNBS">
    <xs:annotation>
      <xs:documentation>
        Código da lista de Nomenclatura Brasileira de Serviços (NBS)
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{9}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodigoInternoContribuinte">
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="20"/>
      <xs:pattern value="[a-zA-Z0-9]{1,20}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDesc40">
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="40"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDesc150">
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="150"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDesc255">
    <xs:restriction base="TSString">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="255"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDesc600">
    <xs:restriction base="TSString">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="600"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDesc500">
    <xs:restriction base="TSString">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="500"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDesc1000">
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="1000"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDesc2000">
    <xs:restriction base="TSStringComQuebraDeLinha">
      <xs:minLength value="1"/>
      <xs:maxLength value="2000"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDec15V2">
    <xs:annotation>
      <xs:documentation>Valor decimal com 1 a 15 dígitos mais 2 casas decimais</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="0|0\\.[0-9]{2}|[1-9]{1}[0-9]{0,14}(\\.[0-9]{2})?"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDec1V2">
    <xs:annotation>
      <xs:documentation>Valor decimal com 1 dígito mais 2 casas decimais</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="0|[0-9]{1}(\\.[0-9]{2})?"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDec2V2">
    <xs:annotation>
      <xs:documentation>Valor decimal com 1 ou 2 dígitos mais 2 casas decimais</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="0|0\\.[0-9]{2}|[1-9]{1}[0-9]{0,1}(\\.[0-9]{2})?"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSDec3V2">
    <xs:annotation>
      <xs:documentation>Valor decimal com 1 a 3 dígitos mais 2 casas decimais</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="0|0\\.[0-9]{2}|[1-9]{1}[0-9]{0,2}(\\.[0-9]{2})?"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNum3Dig">
    <xs:annotation>
      <xs:documentation>Número com 3 dígitos</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="3"/>
      <xs:pattern value="[0-9]{1}[0-9]{0,2}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNum7Dig">
    <xs:annotation>
      <xs:documentation>Número com 7 dígitos</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="7"/>
      <xs:pattern value="[0-9]{7}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNum14Dig">
    <xs:annotation>
      <xs:documentation>Número com 14 dígitos</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="14"/>
      <xs:pattern value="[0-9]{14}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNum15Dig">
    <xs:annotation>
      <xs:documentation>Número com 15 dígitos</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="15"/>
      <xs:pattern value="[0-9]{15}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSIdPedRefEvt">
    <xs:annotation>
      <xs:documentation>
        O identificador do pedido de registro do evento é formado conforme a concatenação dos seguintes campos:
        "PRE" + Chave de Acesso NFS-e + Tipo do evento + Número do Pedido de Registro do Evento (nPedRegEvento)
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="62"/>
      <xs:pattern value="PRE[0-9]{59}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSIdEvento">
    <xs:annotation>
      <xs:documentation>
		  Identificador do evento: "EVT" + Chave de acesso(50) Tipo do evento (6) + Pedido de Registro do Evento(3) (nPedRegEvento)
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:maxLength value="62"/>
      <xs:pattern value="EVT[0-9]{59}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCodigoEventoNFSe">
    <xs:annotation>
      <xs:documentation>
		  Código de evento da NFS-e
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:enumeration value="e101101"/>
      <xs:enumeration value="e105102"/>
      <xs:enumeration value="e105104"/>
      <xs:enumeration value="e105105"/>
      <xs:enumeration value="e305101"/>
      <xs:enumeration value="e907202"/>
      <xs:enumeration value="e967203"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSIdNumEvento">
    <xs:annotation>
      <xs:documentation>
		  Referência ao Id "Manifestação de rejeição da NFS-e" que originou o presente evento de anulação.
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{59}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNumDFe">
    <xs:annotation>
      <xs:documentation>
		  Número sequencial do documento gerado por ambiente gerador de DFe do município.
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{1,13}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSSituacaoCadastroContribuinte">
    <xs:annotation>
      <xs:documentation>Identificação da situação do cadastro do contribuinte</xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="150"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSMotivoSituacaoCadastroContribuinte">
    <xs:annotation>
      <xs:documentation>Motivo pelo qual o contribuinte se enquadra na situação informada</xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSSituacaoEmissaoNFSE">
    <xs:annotation>
      <xs:documentation>
		  Situação Emissão NFS-e:
        0 - Não Habilitado;
        1 - Habilitado;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
      <xs:enumeration value="1"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSCategoriaServico">
    <xs:annotation>
      <xs:documentation>
		  Categorias do serviço:
        1 - Locação;
        2 - Sublocação;
        3 - Arrendamento;
        4 - Direito de passagem;
        5 - Permissão de uso;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
      <xs:enumeration value="4"/>
      <xs:enumeration value="5"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TCObjetoLocacao">
    <xs:annotation>
      <xs:documentation>
        Tipo de objetos da locação, sublocação, arrendamento, direito de passagem ou permissão de uso:
        1 - Ferrovia;
        2 - Rodovia;
        3 - Postes;
        4 - Cabos;
        5 - Dutos;
        6 - Condutos de qualquer natureza;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
      <xs:enumeration value="4"/>
      <xs:enumeration value="5"/>
      <xs:enumeration value="6"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSExtensaoTotal">
    <xs:annotation>
      <xs:documentation>Extensão total da ferrovia, rodovia, cabos, dutos ou condutos</xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="5"/>
      <xs:pattern value="[0-9]{1,5}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSNumeroPostes">
    <xs:annotation>
      <xs:documentation>Número total de postes</xs:documentation>
    </xs:annotation>
    <xs:restriction base="TSString">
      <xs:minLength value="1"/>
      <xs:maxLength value="6"/>
      <xs:pattern value="[0-9]{1,6}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRTCFinNFSe">
    <xs:annotation>
      <xs:documentation>
        Indicador da finalidade da emissão de NFS-e:
        0 - NFS-e regular;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRTCIndFinal">
    <xs:annotation>
      <xs:documentation>
        Indica operação de uso ou consumo pessoal (art. 57):
        0 - Não;
        1 - Sim;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
      <xs:enumeration value="1"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRTCCodIndOp">
    <xs:annotation>
      <xs:documentation>
        Código indicador da operação de fornecimento, conforme tabela "código indicador de operação"
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{6}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRTCTpOper">
    <xs:annotation>
      <xs:documentation>
        Tipo de Operação com Entes Governamentais ou outros serviços sobre bens imóveis:
        1 – Fornecimento com pagamento posterior;
        2 - Recebimento do pagamento com fornecimento já realizado;
        3 – Fornecimento com pagamento já realizado;
        4 – Recebimento do pagamento com fornecimento posterior;
        5 – Fornecimento e recebimento do pagamento concomitantes;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
      <xs:enumeration value="4"/>
      <xs:enumeration value="5"/>
    </xs:restriction>
  </xs:simpleType>  
  <xs:simpleType name="TSRTCTpEnteGov">
    <xs:annotation>
      <xs:documentation>
        Tipo de ente governamental
        Para administração pública direta e suas autarquias e fundações:
        1 - União;
        2 - Estado;
        3 - Distrito Federal;
        4 - Município;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
      <xs:enumeration value="4"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRTCIndDest">
    <xs:annotation>
      <xs:documentation>
        A respeito do Destinatário dos serviços:
        0 – o destinatário é o próprio tomador/adquirente identificado na NFS-e (tomador = adquirente = destinatário);
        1 – o destinatário não é o próprio adquirente, podendo ser outra pessoa, física ou jurídica (ou equiparada), ou um estabelecimento diferente do indicado como tomador (tomador = adquirente ≠ destinatário);
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="0"/>
      <xs:enumeration value="1"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRTCTpReeRepRes">
    <xs:annotation>
      <xs:documentation>
        Tipo de valor incluído neste documento, recebido por motivo de estarem relacionadas a operações de terceiros,
        objeto de reembolso, repasse ou ressarcimento pelo recebedor, já tributados e aqui referenciados
        01 - Repasse de remuneração por intermediação de imóveis a demais corretores envolvidos na operação;
        02 - Repasse de valores a fornecedor relativo a fornecimento intermediado por agência de turismo;
        03 - Reembolso ou ressarcimento recebido por agência de propaganda e publicidade por valores pagos relativos 
             a serviços de produção externa por conta e ordem de terceiro;
        04 - Reembolso ou ressarcimento recebido por agência de propaganda e publicidade por valores pagos relativos 
             a serviços de mídia por conta e ordem de terceiro;
        99 - Outros reembolsos ou ressarcimentos recebidos por valores pagos relativos a operações por conta e ordem de terceiro;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="01"/>
      <xs:enumeration value="02"/>
      <xs:enumeration value="03"/>
      <xs:enumeration value="04"/>
      <xs:enumeration value="99"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRTCTipoChaveDFe">
    <xs:annotation>
      <xs:documentation>
        Documento fiscal a que se refere a chaveDfe que seja um dos documentos do Repositório Nacional:
        1 - NFS-e;
        2 - NF-e;
        3 - CT-e;
        9 - Outro;
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:enumeration value="1"/>
      <xs:enumeration value="2"/>
      <xs:enumeration value="3"/>
      <xs:enumeration value="9"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRTCChaveDFe">
    <xs:annotation>
      <xs:documentation>
        Chave do Documento Fiscal Eletrônico
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:minLength value="1"/>
      <xs:maxLength value="50"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRTCCodSitTrib">
    <xs:annotation>
      <xs:documentation>
        Código de Situação Tributária
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{3}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRTCCodClassTrib">
    <xs:annotation>
      <xs:documentation>
        Código de Classificação Tributária
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{6}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="TSRTCCodCredPres">
    <xs:annotation>
      <xs:documentation>
        Código e Classificação do Crédito Presumido
      </xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string">
      <xs:whiteSpace value="preserve"/>
      <xs:pattern value="[0-9]{2}"/>
    </xs:restriction>
  </xs:simpleType>
</xs:schema>`,
  },
  {
    fileName: "xmldsig-core-schema.xsd",
    contents: `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE schema
  PUBLIC "-//W3C//DTD XMLSchema 200102//EN" "http://www.w3.org/2001/XMLSchema.dtd"
 [
   <!ATTLIST schema 
     xmlns:ds CDATA #FIXED "http://www.w3.org/2000/09/xmldsig#">
   <!ENTITY dsig 'http://www.w3.org/2000/09/xmldsig#'>
   <!ENTITY % p ''>
   <!ENTITY % s ''>
  ]>

<!-- Schema for XML Signatures
    http://www.w3.org/2000/09/xmldsig#
    $Revision: 1.2 $ on $Date: 2013-04-16 12:48:49 $ by $Author: denis $

    Copyright 2001 The Internet Society and W3C (Massachusetts Institute
    of Technology, Institut National de Recherche en Informatique et en
    Automatique, Keio University). All Rights Reserved.
    http://www.w3.org/Consortium/Legal/

    This document is governed by the W3C Software License [1] as described
    in the FAQ [2].

    [1] http://www.w3.org/Consortium/Legal/copyright-software-19980720
    [2] http://www.w3.org/Consortium/Legal/IPR-FAQ-20000620.html#DTD
-->


<schema xmlns="http://www.w3.org/2001/XMLSchema"
        xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
        targetNamespace="http://www.w3.org/2000/09/xmldsig#"
        version="0.1" elementFormDefault="qualified"> 

<!-- Basic Types Defined for Signatures -->

<simpleType name="CryptoBinary">
  <restriction base="base64Binary">
  </restriction>
</simpleType>

<!-- Start Signature -->

<element name="Signature" type="ds:SignatureType"/>
<complexType name="SignatureType">
  <sequence> 
    <element ref="ds:SignedInfo"/> 
    <element ref="ds:SignatureValue"/> 
    <element ref="ds:KeyInfo" minOccurs="0"/> 
    <element ref="ds:Object" minOccurs="0" maxOccurs="unbounded"/> 
  </sequence>  
  <attribute name="Id" type="ID" use="optional"/>
</complexType>

  <element name="SignatureValue" type="ds:SignatureValueType"/> 
  <complexType name="SignatureValueType">
    <simpleContent>
      <extension base="base64Binary">
        <attribute name="Id" type="ID" use="optional"/>
      </extension>
    </simpleContent>
  </complexType>

<!-- Start SignedInfo -->

<element name="SignedInfo" type="ds:SignedInfoType"/>
<complexType name="SignedInfoType">
  <sequence> 
    <element ref="ds:CanonicalizationMethod"/> 
    <element ref="ds:SignatureMethod"/> 
    <element ref="ds:Reference" maxOccurs="unbounded"/> 
  </sequence>  
  <attribute name="Id" type="ID" use="optional"/> 
</complexType>

  <element name="CanonicalizationMethod" type="ds:CanonicalizationMethodType"/> 
  <complexType name="CanonicalizationMethodType" mixed="true">
    <sequence>
      <any namespace="##any" minOccurs="0" maxOccurs="unbounded"/>
      <!-- (0,unbounded) elements from (1,1) namespace -->
    </sequence>
    <attribute name="Algorithm" type="anyURI" use="required"/> 
  </complexType>

  <element name="SignatureMethod" type="ds:SignatureMethodType"/>
  <complexType name="SignatureMethodType" mixed="true">
    <sequence>
      <element name="HMACOutputLength" minOccurs="0" type="ds:HMACOutputLengthType"/>
      <any namespace="##other" minOccurs="0" maxOccurs="unbounded"/>
      <!-- (0,unbounded) elements from (1,1) external namespace -->
    </sequence>
    <attribute name="Algorithm" type="anyURI" use="required"/> 
  </complexType>

<!-- Start Reference -->

<element name="Reference" type="ds:ReferenceType"/>
<complexType name="ReferenceType">
  <sequence> 
    <element ref="ds:Transforms" minOccurs="0"/> 
    <element ref="ds:DigestMethod"/> 
    <element ref="ds:DigestValue"/> 
  </sequence>
  <attribute name="Id" type="ID" use="optional"/> 
  <attribute name="URI" type="anyURI" use="optional"/> 
  <attribute name="Type" type="anyURI" use="optional"/> 
</complexType>

  <element name="Transforms" type="ds:TransformsType"/>
  <complexType name="TransformsType">
    <sequence>
      <element ref="ds:Transform" maxOccurs="unbounded"/>  
    </sequence>
  </complexType>

  <element name="Transform" type="ds:TransformType"/>
  <complexType name="TransformType" mixed="true">
    <choice minOccurs="0" maxOccurs="unbounded"> 
      <any namespace="##other" processContents="lax"/>
      <!-- (1,1) elements from (0,unbounded) namespaces -->
      <element name="XPath" type="string"/> 
    </choice>
    <attribute name="Algorithm" type="anyURI" use="required"/> 
  </complexType>

<!-- End Reference -->

<element name="DigestMethod" type="ds:DigestMethodType"/>
<complexType name="DigestMethodType" mixed="true"> 
  <sequence>
    <any namespace="##other" processContents="lax" minOccurs="0" maxOccurs="unbounded"/>
  </sequence>    
  <attribute name="Algorithm" type="anyURI" use="required"/> 
</complexType>

<element name="DigestValue" type="ds:DigestValueType"/>
<simpleType name="DigestValueType">
  <restriction base="base64Binary"/>
</simpleType>

<!-- End SignedInfo -->

<!-- Start KeyInfo -->

<element name="KeyInfo" type="ds:KeyInfoType"/> 
<complexType name="KeyInfoType" mixed="true">
  <choice maxOccurs="unbounded">     
    <element ref="ds:KeyName"/> 
    <element ref="ds:KeyValue"/> 
    <element ref="ds:RetrievalMethod"/> 
    <element ref="ds:X509Data"/> 
    <element ref="ds:PGPData"/> 
    <element ref="ds:SPKIData"/>
    <element ref="ds:MgmtData"/>
    <any processContents="lax" namespace="##other"/>
    <!-- (1,1) elements from (0,unbounded) namespaces -->
  </choice>
  <attribute name="Id" type="ID" use="optional"/> 
</complexType>

  <element name="KeyName" type="string"/>
  <element name="MgmtData" type="string"/>

  <element name="KeyValue" type="ds:KeyValueType"/> 
  <complexType name="KeyValueType" mixed="true">
   <choice>
     <element ref="ds:DSAKeyValue"/>
     <element ref="ds:RSAKeyValue"/>
     <any namespace="##other" processContents="lax"/>
   </choice>
  </complexType>

  <element name="RetrievalMethod" type="ds:RetrievalMethodType"/> 
  <complexType name="RetrievalMethodType">
    <sequence>
      <element ref="ds:Transforms" minOccurs="0"/> 
    </sequence>  
    <attribute name="URI" type="anyURI"/>
    <attribute name="Type" type="anyURI" use="optional"/>
  </complexType>

<!-- Start X509Data -->

<element name="X509Data" type="ds:X509DataType"/> 
<complexType name="X509DataType">
  <sequence maxOccurs="unbounded">
    <choice>
      <element name="X509IssuerSerial" type="ds:X509IssuerSerialType"/>
      <element name="X509SKI" type="base64Binary"/>
      <element name="X509SubjectName" type="string"/>
      <element name="X509Certificate" type="base64Binary"/>
      <element name="X509CRL" type="base64Binary"/>
      <any namespace="##other" processContents="lax"/>
    </choice>
  </sequence>
</complexType>

<complexType name="X509IssuerSerialType"> 
  <sequence> 
    <element name="X509IssuerName" type="string"/> 
    <element name="X509SerialNumber" type="integer"/> 
  </sequence>
</complexType>

<!-- End X509Data -->

<!-- Begin PGPData -->

<element name="PGPData" type="ds:PGPDataType"/> 
<complexType name="PGPDataType"> 
  <choice>
    <sequence>
      <element name="PGPKeyID" type="base64Binary"/> 
      <element name="PGPKeyPacket" type="base64Binary" minOccurs="0"/> 
      <any namespace="##other" processContents="lax" minOccurs="0"
       maxOccurs="unbounded"/>
    </sequence>
    <sequence>
      <element name="PGPKeyPacket" type="base64Binary"/> 
      <any namespace="##other" processContents="lax" minOccurs="0"
       maxOccurs="unbounded"/>
    </sequence>
  </choice>
</complexType>

<!-- End PGPData -->

<!-- Begin SPKIData -->

<element name="SPKIData" type="ds:SPKIDataType"/> 
<complexType name="SPKIDataType">
  <sequence maxOccurs="unbounded">
    <element name="SPKISexp" type="base64Binary"/>
    <any namespace="##other" processContents="lax" minOccurs="0"/>
  </sequence>
</complexType> 

<!-- End SPKIData -->

<!-- End KeyInfo -->

<!-- Start Object (Manifest, SignatureProperty) -->

<element name="Object" type="ds:ObjectType"/> 
<complexType name="ObjectType" mixed="true">
  <sequence minOccurs="0" maxOccurs="unbounded">
    <any namespace="##any" processContents="lax"/>
  </sequence>
  <attribute name="Id" type="ID" use="optional"/> 
  <attribute name="MimeType" type="string" use="optional"/> <!-- add a grep facet -->
  <attribute name="Encoding" type="anyURI" use="optional"/> 
</complexType>

<element name="Manifest" type="ds:ManifestType"/> 
<complexType name="ManifestType">
  <sequence>
    <element ref="ds:Reference" maxOccurs="unbounded"/> 
  </sequence>
  <attribute name="Id" type="ID" use="optional"/> 
</complexType>

<element name="SignatureProperties" type="ds:SignaturePropertiesType"/> 
<complexType name="SignaturePropertiesType">
  <sequence>
    <element ref="ds:SignatureProperty" maxOccurs="unbounded"/> 
  </sequence>
  <attribute name="Id" type="ID" use="optional"/> 
</complexType>

   <element name="SignatureProperty" type="ds:SignaturePropertyType"/> 
   <complexType name="SignaturePropertyType" mixed="true">
     <choice maxOccurs="unbounded">
       <any namespace="##other" processContents="lax"/>
       <!-- (1,1) elements from (1,unbounded) namespaces -->
     </choice>
     <attribute name="Target" type="anyURI" use="required"/> 
     <attribute name="Id" type="ID" use="optional"/> 
   </complexType>

<!-- End Object (Manifest, SignatureProperty) -->

<!-- Start Algorithm Parameters -->

<simpleType name="HMACOutputLengthType">
  <restriction base="integer"/>
</simpleType>

<!-- Start KeyValue Element-types -->

<element name="DSAKeyValue" type="ds:DSAKeyValueType"/>
<complexType name="DSAKeyValueType">
  <sequence>
    <sequence minOccurs="0">
      <element name="P" type="ds:CryptoBinary"/>
      <element name="Q" type="ds:CryptoBinary"/>
    </sequence>
    <element name="G" type="ds:CryptoBinary" minOccurs="0"/>
    <element name="Y" type="ds:CryptoBinary"/>
    <element name="J" type="ds:CryptoBinary" minOccurs="0"/>
    <sequence minOccurs="0">
      <element name="Seed" type="ds:CryptoBinary"/>
      <element name="PgenCounter" type="ds:CryptoBinary"/>
    </sequence>
  </sequence>
</complexType>

<element name="RSAKeyValue" type="ds:RSAKeyValueType"/>
<complexType name="RSAKeyValueType">
  <sequence>
    <element name="Modulus" type="ds:CryptoBinary"/> 
    <element name="Exponent" type="ds:CryptoBinary"/> 
  </sequence>
</complexType> 

<!-- End KeyValue Element-types -->

<!-- End Signature -->

</schema>
`,
  },
];
