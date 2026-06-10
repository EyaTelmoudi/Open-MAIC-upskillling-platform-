# 3S Group Tenants Reference

This file prepares tenant data that can be used by the SuperAdmin to create company workspaces in the platform.

Sources checked on 2026-06-09:

- 3S Group official website: https://www.3sgroup.tn/
- 3S Group IT subsidiaries: https://www.3sgroup.tn/it/
- 3S Group CleanTech subsidiaries: https://www.3sgroup.tn/cleantech/
- 3S Group diverse activities: https://www.3sgroup.tn/activites-diverses/
- Standard Sharing Software official website: https://www.3s.com.tn/

Important:

- Email domains are prepared from the public websites when no official employee email domain is published.
- Before enabling Azure Entra ID or strict email-domain matching, verify the real corporate email domain with the company/admin.
- Some subsidiaries are listed publicly by activity description but without a clearly visible public domain; these are marked as "to verify".

## Confirmed / Recommended Tenants

| Company Name | Suggested Slug | Suggested Email Domain | Website URL | Suggested Primary Color | Notes |
|---|---|---|---|---|---|
| Standard Sharing Software 3S | `3s` | `3s.com.tn` | https://www.3s.com.tn/ | `#ed851a` | Main 3S IT company / group company. |
| GlobalNet | `globalnet` | `gnet.tn` | https://www.gnet.tn/ | `#0057B8` | ISP brand of 3S Group. If your existing tenant uses `globalnet.tn`, keep it only if that is the real internal email domain. |
| GlobalNet Business | `globalnet-business` | `gnet.tn` | https://www.gnet.tn/ | `#0057B8` | Business branch of GlobalNet. Prefer keeping it inside GlobalNet unless you need a separate workspace. |
| Advancia Training | `advancia-training` | `advancia-training.com` | https://www.advancia-training.com/ | `#1f6fb2` | IT training and certification entity. |
| Cyberesa | `cyberesa` | `cyberesa.net` | https://www.cyberesa.net/ | `#2b6cb0` | E-tourism software / SaaS solutions. |
| Smartup | `smartup` | `smartup.tn` | https://www.smartup.tn/ | `#21409a` | ERP / business software publisher. |
| Hexabyte | `hexabyte` | `hexabyte.tn` | https://hexabyte.tn/ | `#e30613` | Internet access, connectivity and high-tech products. |
| Pro2C | `pro2c` | `pro2c.com` | https://www.pro2c.com/ | `#0f766e` | Multichannel contact center / customer relationship management. |
| Sky Industries / CandyLed | `sky-industries-candyled` | `candyled.com` | https://www.candyled.com/ | `#f59e0b` | CandyLed is the LED brand of Sky Industries, a 3S Group CleanTech subsidiary. |
| Africa Solar | `africa-solar` | `africa-solar.com` | https://www.africa-solar.com/ | `#f97316` | Photovoltaic studies and renewable-energy installations. |
| BioPack | `biopack` | `biopack.tn` | https://www.biopack.tn/ | `#16a34a` | Bioplastic / biodegradable and compostable materials. |
| Oceane | `oceane` | `oceane.world` | https://www.oceane.world/ | `#0284c7` | Boat construction / naval activity. |

## Tenants To Verify Before Creation

| Public Name / Description | Suggested Slug | Email Domain | Website URL | Recommendation |
|---|---|---|---|---|
| STE DE PROMOTION IMMOBILIERE NEFISSA | `nefissa` | to verify | to verify | Create only if you have the real email domain. Public sources show it as a real-estate company based in Tunisia. |
| 3S Group capital-risk investment company | `3s-capital` | to verify | to verify | Public 3S page mentions a capital-risk investment company, but the public name/domain are not clearly exposed. |
| Multicom | `multicom` | to verify | to verify | Mentioned in 3S Group media content with CandyLed. Verify whether it is a subsidiary and get its official domain before creating a tenant. |
| Packaging / intelligent packaging entity | `packaging-3s` | to verify | to verify | Public 3S page lists an intelligent-packaging activity, but the company name/domain are not clearly exposed. |
| Boat trading / accessories entity | `marine-trading-3s` | to verify | to verify | Public 3S page lists a boat trading/accessories activity, but the company name/domain are not clearly exposed. |

## Recommended Creation Order In The Platform

1. Create only the tenants with confirmed domains first.
2. Use `Standard Sharing Software 3S` and `GlobalNet` as the first two tenants because they are central and already used in the project.
3. Add IT subsidiaries next: `Advancia Training`, `Cyberesa`, `Smartup`, `Hexabyte`, `Pro2C`.
4. Add CleanTech subsidiaries next: `Sky Industries / CandyLed`, `Africa Solar`, `BioPack`.
5. Add diverse activities only after validating their official email domains.

## Suggested Seat Limits For Demo

For PFE/demo data, use small limits:

- Main 3S tenant: `300`
- GlobalNet: `300`
- Advancia Training: `100`
- Smartup: `100`
- Cyberesa: `80`
- Hexabyte: `120`
- Pro2C: `150`
- CandyLed / Sky Industries: `100`
- Africa Solar: `80`
- BioPack: `80`
- Oceane: `60`

These limits are only demo values. Use real HR/company numbers for production.
