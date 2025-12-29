import axios from 'axios';

// Interfaces
interface ApiResult {
  apiName: string;
  found: boolean;
  imageUrl?: string;
  productName?: string;
  error?: string;
}

interface ProductResult {
  ean: string;
  results: ApiResult[];
  bestMatch?: ApiResult; // Primeira API que encontrou
}

// Função para testar Open Food Facts
async function testOpenFoodFacts(ean: string): Promise<ApiResult> {
  try {
    const response = await axios.get(
      `https://world.openfoodfacts.org/api/v0/product/${ean}.json`,
      { timeout: 10000 }
    );

    if (response.data.status === 1 && response.data.product) {
      const product = response.data.product;
      let imageUrl: string | undefined;

      // Tentar diferentes campos de imagem
      if (product.image_url) {
        imageUrl = product.image_url;
      } else if (product.images?.front_url) {
        imageUrl = `https://world.openfoodfacts.org${product.images.front_url}`;
      } else if (product.images?.front?.display) {
        imageUrl = `https://world.openfoodfacts.org${product.images.front.display}`;
      }

      return {
        apiName: 'Open Food Facts',
        found: true,
        imageUrl,
        productName: product.product_name || product.product_name_pt || product.generic_name,
      };
    }

    return {
      apiName: 'Open Food Facts',
      found: false,
      error: 'Product not found',
    };
  } catch (error: any) {
    return {
      apiName: 'Open Food Facts',
      found: false,
      error: error.message || 'Request failed',
    };
  }
}

// Função para testar UPCitemdb
async function testUPCitemdb(ean: string): Promise<ApiResult> {
  try {
    const response = await axios.get(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${ean}`,
      { timeout: 10000 }
    );

    if (response.data.code === 'OK' && response.data.items && response.data.items.length > 0) {
      const item = response.data.items[0];
      let imageUrl: string | undefined;

      if (item.images && item.images.length > 0) {
        imageUrl = item.images[0];
      }

      return {
        apiName: 'UPCitemdb',
        found: true,
        imageUrl,
        productName: item.title || item.description,
      };
    }

    return {
      apiName: 'UPCitemdb',
      found: false,
      error: 'Product not found',
    };
  } catch (error: any) {
    return {
      apiName: 'UPCitemdb',
      found: false,
      error: error.message || 'Request failed',
    };
  }
}

// Função para testar Open Product Data
async function testOpenProductData(ean: string): Promise<ApiResult> {
  try {
    const response = await axios.get(
      `https://www.openproductdata.org/api/v1/product/${ean}`,
      { timeout: 10000 }
    );

    if (response.data && response.data.product) {
      const product = response.data.product;

      return {
        apiName: 'Open Product Data',
        found: true,
        imageUrl: product.image_url,
        productName: product.name || product.title,
      };
    }

    return {
      apiName: 'Open Product Data',
      found: false,
      error: 'Product not found',
    };
  } catch (error: any) {
    return {
      apiName: 'Open Product Data',
      found: false,
      error: error.message || 'Request failed',
    };
  }
}

// Função para testar Barcode Lookup (sem API key primeiro)
async function testBarcodeLookup(ean: string): Promise<ApiResult> {
  try {
    // Tentar sem API key primeiro (pode não funcionar)
    const response = await axios.get(
      `https://api.barcodelookup.com/v3/products?barcode=${ean}&formatted=y`,
      { timeout: 10000 }
    );

    if (response.data && response.data.products && response.data.products.length > 0) {
      const product = response.data.products[0];

      return {
        apiName: 'Barcode Lookup',
        found: true,
        imageUrl: product.images?.[0] || product.image,
        productName: product.product_name || product.title,
      };
    }

    return {
      apiName: 'Barcode Lookup',
      found: false,
      error: 'Product not found or API key required',
    };
  } catch (error: any) {
    return {
      apiName: 'Barcode Lookup',
      found: false,
      error: error.message || 'Request failed (may require API key)',
    };
  }
}

// Função para testar todas as APIs
async function testAllApis(ean: string): Promise<ProductResult> {
  console.log(`\n🔍 Testando EAN: ${ean}`);
  console.log('─'.repeat(60));

  const results: ApiResult[] = [];

  // Testar todas as APIs em paralelo
  const [openFoodFacts, upcitemdb, openProductData, barcodeLookup] = await Promise.all([
    testOpenFoodFacts(ean),
    testUPCitemdb(ean),
    testOpenProductData(ean),
    testBarcodeLookup(ean),
  ]);

  results.push(openFoodFacts, upcitemdb, openProductData, barcodeLookup);

  // Encontrar o melhor match (primeira API que encontrou)
  const bestMatch = results.find((r) => r.found);

  // Exibir resultados
  results.forEach((result) => {
    if (result.found) {
      console.log(`✅ ${result.apiName}:`);
      console.log(`   Produto: ${result.productName || 'N/A'}`);
      console.log(`   Imagem: ${result.imageUrl || 'Não disponível'}`);
    } else {
      console.log(`❌ ${result.apiName}: ${result.error}`);
    }
  });

  if (bestMatch) {
    console.log(`\n✨ Melhor resultado: ${bestMatch.apiName}`);
  } else {
    console.log(`\n⚠️  Nenhuma API encontrou o produto`);
  }

  return {
    ean,
    results,
    bestMatch,
  };
}

// Função principal
async function main(): Promise<void> {
  console.log('🚀 Iniciando teste de APIs de produtos por EAN\n');
  console.log('='.repeat(60));

  const eans = [
    '7897254122533',
    '7899632521556',
    '7897254121666',
    '7891173024916',
  ];

  const allResults: ProductResult[] = [];

  // Processar cada código
  for (const ean of eans) {
    const result = await testAllApis(ean);
    allResults.push(result);
    
    // Pequeno delay entre requisições para não sobrecarregar as APIs
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Resumo final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO FINAL');
  console.log('='.repeat(60));

  allResults.forEach((result) => {
    console.log(`\nEAN: ${result.ean}`);
    if (result.bestMatch) {
      console.log(`  ✅ Encontrado em: ${result.bestMatch.apiName}`);
      console.log(`  📦 Produto: ${result.bestMatch.productName || 'N/A'}`);
      console.log(`  🖼️  Imagem: ${result.bestMatch.imageUrl || 'Não disponível'}`);
    } else {
      console.log(`  ❌ Não encontrado em nenhuma API`);
    }
  });

  // Estatísticas
  const foundCount = allResults.filter((r) => r.bestMatch).length;
  const notFoundCount = allResults.length - foundCount;

  console.log('\n' + '='.repeat(60));
  console.log('📈 ESTATÍSTICAS');
  console.log('='.repeat(60));
  console.log(`Total de produtos testados: ${allResults.length}`);
  console.log(`✅ Encontrados: ${foundCount}`);
  console.log(`❌ Não encontrados: ${notFoundCount}`);
  console.log(`📊 Taxa de sucesso: ${((foundCount / allResults.length) * 100).toFixed(1)}%`);

  // Contagem por API
  console.log('\n' + '='.repeat(60));
  console.log('🔢 RESULTADOS POR API');
  console.log('='.repeat(60));

  const apiStats: { [key: string]: number } = {};
  allResults.forEach((result) => {
    result.results.forEach((apiResult) => {
      if (apiResult.found) {
        apiStats[apiResult.apiName] = (apiStats[apiResult.apiName] || 0) + 1;
      }
    });
  });

  Object.entries(apiStats).forEach(([apiName, count]) => {
    console.log(`${apiName}: ${count}/${allResults.length} produtos encontrados`);
  });

  console.log('\n✅ Teste concluído!\n');
}

// Executar
main().catch((error) => {
  console.error('❌ Erro ao executar script:', error);
  process.exit(1);
});

