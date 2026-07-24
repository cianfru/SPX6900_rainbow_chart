-- ============================================================================
-- SPX6900 balance for the AEON holders  →  cross-holder axis for the Holder Skyline
-- ============================================================================
-- We only track AEON NFT holders, so this pulls SPX6900 balances ONLY for the 120
-- wallets in the skyline (embedded below) — a tiny result (~120 rows) and the tightest
-- possible scan. build-aeon-onchain.mjs --spx=this.csv joins it so tower height can combine
-- AEON held + SPX held (× holding duration).
--
-- CHEAP: filters the SPX contract's evt_Transfer partition to just these addresses and
-- GROUPs net flow (received - sent) -> current balance. Plain filter + UNION + GROUP BY, no
-- joins/windows, no balances_daily (that table timed out - every token x address x day).
-- SPX6900 ERC-20: 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c - decimals 8. Output columns: address, spx (human units).
-- Regenerate if the holder set changes: node scripts/gen-aeon-spx-query.mjs
-- ============================================================================
WITH aeon (address) AS (
  VALUES
  (0xa4c34d74a2d79be8fe9a5fc601d106d52e815c9f),
  (0xf2a2cdc1b60736e7d3e71c6c52c5adde71b63d58),
  (0x8413f65e93d31f52706c301bcc86e0727fd7c025),
  (0x21e0974aa7257861343a05d48940d54e1eff3222),
  (0x4c9f4bc45c31d3eb681c4bc44d08953172685b51),
  (0x900061159a6ac94a422ebf64a179b30ac168830c),
  (0x9ab9ced0a8963b45ad10076566f237cee1cf1e47),
  (0x42b21a5285424b0547f4e2c61d937ea1b19f0c5b),
  (0x168062538eb5cb8ca7adf83ac959b5fe53c62cc6),
  (0x07009761dc7d59c0006d223047b2b4cf8a67efee),
  (0x2586181d6544b49060d48f8c1322339ed2876f16),
  (0xeb313a84b762aaf37f006eb90186fd0be8df9327),
  (0xad51b811695ebef57540e241ba98d5ec071a849d),
  (0xdc1eeb34334492503509dd2102195567d9557244),
  (0x6d6f25b9d43302d3d355745c1095ced0e20c8854),
  (0x24100bd8dacf707f36580010fb4dc02ce028032c),
  (0xb744172b48a841529f3feae060bfd1025054337d),
  (0xbb020fa1a2bd3c5d1e568b988d2885becdc3ab6c),
  (0x3fe1e2f4ee543a0a0c3bde927357fc8214872229),
  (0x6901370415c2a27e1d19e4690ae39829c01936a1),
  (0x2da96025fbceb584fb24a63ff47f5c4bd459acea),
  (0x7e10af6fd9766386262287ec7751df5259820995),
  (0x74e84956df8af8354e82031de46eeddf99018d30),
  (0x880cd0cf119ece0eecf6a657a52c766a8ad5bedb),
  (0x8675c1c5e5a480e277cb4589a6bd17545be1e3b8),
  (0x67ab3f037c04ca964b6f8cfb4c2a069407150a3e),
  (0x50f27cdb650879a41fb07038bf2b818845c20e17),
  (0xe2cfba3e0a8ce0825c5cbefdc60d7e78cc35aaf3),
  (0x67d1456e2e8ded0c0cd3e63d2a085e36f84cb168),
  (0xdb22ca143f6396ad289c79cdfa5cc47f65884162),
  (0xde4326289ebf1107df660a2bc6a78c1d819ee785),
  (0x7d377312108af53822bbc5c3636e211daed55d23),
  (0x0c5a2c72c009252f0e7312f5a1ab87de02be6fbe),
  (0x86567611b3b1d1e61581e73f3a97fc4106016497),
  (0x69ce750905025684818855e54bfaf3022512b0e3),
  (0x310f0a2fb4e5fdaf19ebec249405bcc9e8379d37),
  (0xbd336b75d1beed3c33296292c5ef1057fd5d3b47),
  (0xfd6cdb7fd57642d2bf3c95f9d73665990e8c89d5),
  (0x2a54adc5a26ce16df2f654126bd27acba050e8dd),
  (0xe5443bfe9a0b4c67c80aea056cfbd76018739654),
  (0xb9eb79e3e735ee636255dd8d65872a1287744e33),
  (0x1e5c797a569276bda2ee21750186000e01d2bb5b),
  (0x0e78903583842e0ff4f9d97fac457de5feb5eb95),
  (0xc0c9e764ec6bd33e0589926c5f788625a065fdeb),
  (0x758462211063d754368c18bd6c873b81ecf61508),
  (0x8bcc4fbb00ed1f34dddf14e9b6ec447efc7bf754),
  (0x6e9d358902c1a5ff795a471e1cd44f46a2270d68),
  (0x17681ae02f9ee53c8138b508810d61a08a70d627),
  (0x9c968da4e5fd7b6a4709b993cc21c8ef0eb26f6e),
  (0x5480dc9f9aa03f57f7da6ac8321819e5973ba5cc),
  (0xa2dcfc2076dc6f1260cecac459c89e54d356d632),
  (0x1a162a0a4047b46e1ff11f4c02466046c5366b8f),
  (0xecff0aecbf02bd0b3fe17285ab8e125685918dab),
  (0x1208ec710852c271526a2db652074c1762f64d2b),
  (0xb4d1e110061671a2dc94ae93d4eb859ed668d7b5),
  (0x412ef072a33b2b283549cfde447fc0bbe5462959),
  (0x1eec58e873fee00bd8165d6e0e21415afda2779f),
  (0x187b148aee36fc95a6460babed3bddfaaa1f003c),
  (0xd340e01ae68e27f2e50ed8191adb71c2094fc274),
  (0x74f885f49020551a73669ae248fed5a1f346b124),
  (0x7e744b70a3bc965a5c127ad63a98aa2393466984),
  (0xc443d816a011d720dc8f3dd69390b16554ff2a3b),
  (0x018d95a786da83066d827b56340f3ec87d65814b),
  (0x503d63c56fd46446c1406572afff11e44b3a922f),
  (0x7079bfcd09ac050d3c8ca5d230336505bf5beb8a),
  (0x13784c7481cf3f7f0a3db152ec0f0bcb624cdb1e),
  (0xc106e01f6406a0e579d721a4002d072686f14219),
  (0x9c306aafa45e10e71b3ed7e347260e41ddf9873f),
  (0xd484c9307df5fbc2cd5cde71212a6ae870ddacd0),
  (0x2964d617fd62994a65102c82dde82ae46d7503ff),
  (0xa42192805df7489e6b99b4fc2e9e4569445e52fb),
  (0xe876b710b38c2e34513c5d2c40027b1cda967578),
  (0xf7d7bfa5f536f36aa9a1c7173d88e6ff2e45398a),
  (0xb60acdeecf59e460051ca23ce6adbeeb8a58e385),
  (0xf865067a5b9672f11af8514440d9111afd05d040),
  (0x8da0a5f9dd8ad28298041835259281ce05feaf3c),
  (0x6f0b3a8a7d505d91cf8dd646a98b8149e0d077d3),
  (0x0caa085c477609a8a1d3ad778306e29d58b8db66),
  (0x0b4a55ce76050a76b7b95ce26c8a283dcd2523ce),
  (0x4d720a0235eeb7aef45430dda2b9f337ae7efe33),
  (0x3de73aec76602bab50fe9499d6f230b653e9d619),
  (0x76a4a8f1b1bf36258af7f45fe1d7dc9b00d83291),
  (0xe881ed1a122fa74eae2877dd26385db6c246d09e),
  (0xc25f11c6afcf65eff9a947cefaa4a9c32a2750b4),
  (0x4bede6f67be997ae703e6fa1abb9579cf5fdacac),
  (0xe38a12cd2c8038b0d8047cbfd660e6024553895d),
  (0xe637dfb607b943e5dcf9f3594ac4ee67956e2311),
  (0xd0daddf983fce88bef3f10fc12280d0f0cd1208c),
  (0x81adf477e396668a0f6a3b77f4531c8cc13c2616),
  (0x5d0579e2abf19445950600f4847fcf8a564abc29),
  (0x4a04f7cd09edc4ad8b3104418ffd985374bb1c24),
  (0xac5b3c89cb13446525fdeb40d0a9873db5542036),
  (0xcf0786f50ed6e4939697aa97d57fef81e33be0d6),
  (0x55d578950d3f21364537cd561149313627054e8c),
  (0xdb47714727cba70f0408ba30dc4ea0b5ac436055),
  (0xdf45e0868c741341fc14b43f59d641422542c578),
  (0xc0fe748a5986267edb625266fa23bdb732dbdd1e),
  (0x5529e0608cfc0cab5bb86b59cba7e88f0f66dfef),
  (0x655048fd3301fb9d767071772ddc055ae30a94da),
  (0x493210103ace77acd645dfb0c616d20cab83e947),
  (0xaf4b91a02cefcea9304f8c16a74e4586ac619b9d),
  (0x85074968d0ff84f4a0ccc6ee50327ed8f7a8ef32),
  (0x472dcfaee0475909a7061c9c8ba3772e5dc1ed5e),
  (0xb84625efc54d27a74020f752c957ef22faab9fef),
  (0xfae4924bbd1ecfd63fd9ea15ef429b5ac53c8512),
  (0x932bdd2d5e21475e62d2fea8158fc5974507cb1a),
  (0x22145532180494d08425b2c189338f9f982889e1),
  (0x9eccbfea2894cf722cd8f7d309069591b850651b),
  (0xaa5fb47246678d9d17d4c83cbd2680872d2fdc3b),
  (0x6a71ae86b120516796bd5e96ac7f67d92ebd7b2c),
  (0x025a1d3060eee19b1efe3972196f29e1abb81b34),
  (0xe98e38bb169d44e8b59327e742c166ac79ab50c0),
  (0x15699ff33ebedf4c426619d81701b1ef7e253fc6),
  (0xa556f623c5009158c6d96c64729c52a24702c8d9),
  (0xe6a5cabb327bb22d4c6387b0016f23ad0c3ad07c),
  (0xd1d74beb531a6b431b84d91a10e5a0d0dca7a48e),
  (0xe00ed6e41270c3a248d4179b87c5f8695ae840cc),
  (0x02d4ac9b89589d6fbc482a10e711472a5e43c6d6),
  (0x7dfcc1bece7ce7e72c9a2227531c0af7b8eb25dc),
  (0x5f5a7cabaaa07f42d8c558ed061371c0dacf2011)
),
flows AS (
  SELECT "to"   AS address,  CAST(value AS DOUBLE) AS v
  FROM erc20_ethereum.evt_Transfer
  WHERE contract_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
    AND "to"   IN (SELECT address FROM aeon)
  UNION ALL
  SELECT "from" AS address, -CAST(value AS DOUBLE) AS v
  FROM erc20_ethereum.evt_Transfer
  WHERE contract_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
    AND "from" IN (SELECT address FROM aeon)
)
SELECT address, SUM(v) / 1e8 AS spx
FROM flows
GROUP BY address
HAVING SUM(v) > 100000000     -- >= 1 SPX (8 decimals); drops dust
ORDER BY spx DESC;
