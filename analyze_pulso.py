import json

with open('data/vitrine_ia.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

noticias = data.get('noticias_quentes', [])
temas = data.get('temas_ativos', [])

print(f'Total noticias_quentes: {len(noticias)}')
print(f'Total temas_ativos: {len(temas)}')
print(f'UpdatedAt: {data.get("updatedAt")}')
print(f'Batch ID: {data.get("batch_id")}')
print(f'Source: {data.get("source")}')

# Count pulso vs curadoria items
pulso_items = [t for t in temas if t.get('origem_pipeline') == 'pulso']
curadoria_items = [t for t in temas if t.get('origem_pipeline') == 'curadoria']

print(f'\nItems pipeline Pulso: {len(pulso_items)}')
print(f'Items pipeline Curadoria: {len(curadoria_items)}')

# Show pulso items
print('\n--- Itens do Pulso V2 ---')
for item in pulso_items:
    print(f'  - {item.get("titulo_curto", "")[:60]} ... ({item.get("categoria", "")})')
    print(f'    slug: {item.get("slug", "")}')
    print(f'    expires_at: {item.get("expires_at", "")}')
    print(f'    veiculos: {item.get("veiculos_origem", [])}')
    print()