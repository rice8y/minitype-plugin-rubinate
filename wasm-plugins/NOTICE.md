# WASM licenses and notices

This directory contains the Rust sources and dictionary data used to build Rubinate's bundled WASM modules. The following table identifies their roles and applicable licenses. The complete third-party notices appear below; the MIT license text for Rubinate and the reused auto-jrubby original code is provided in [LICENSE](../LICENSE). Each component's licensing attribution is stated separately below.

| Component | Use in Rubinate | License |
| --- | --- | --- |
| [auto-jrubby](#auto-jrubby) | Rust analyzers, reading alignment and furigana lookup | MIT |
| [Lindera](#lindera) | Morphological analysis | MIT |
| [IPADIC](#ipadic) | Default morphological dictionary | IPADIC terms, including NAIST and ICOT notices |
| [UniDic](#unidic) | Optional morphological dictionary | BSD-3-Clause |
| [JmdictFurigana and JmnedictFurigana](#furigana-data) | Surface-to-reading correspondence | CC BY-SA 4.0 |

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for package-level attribution and [assets/manifest.json](../assets/manifest.json) for source revisions and checksums. The Cargo manifests and lockfiles record the Rust dependencies and their versions.

## auto-jrubby

Rubinate ports the automatic Japanese ruby functionality of [auto-jrubby](https://github.com/rice8y/auto-jrubby), revision `5096e9fcd4f07e22b9b0d93d363b5c3b140f0c4b`. The shared implementation includes the IPADIC and UniDic analyzers, reading alignment, furigana lookup and compressed correspondence data. These sources are maintained under this directory. Rubinate replaces the upstream Typst plugin interface with its own buffer ABI; the TypeScript adapter and minitype integration are also Rubinate additions.

The auto-jrubby code included in Rubinate is distributed under the **MIT License**, copyright (c) 2026 Eito Yoneyama. The complete license text is in [LICENSE](../LICENSE). Dictionary and third-party component terms are listed below.

## Lindera

The analyzers use Lindera 1.4.1 from the [rice8y fork](https://github.com/rice8y/lindera_fork), revision `33f5874c934877382bfebd9a6acc62e36f58d208`. The following MIT notice is reproduced from that revision's `LICENSE`.

MIT License

Copyright (c) 2019 by the project authors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## IPADIC

The IPADIC dictionary is embedded in `assets/ipadic.wasm`. The following notice is reproduced from MeCab IPADIC's `COPYING`, including its NAIST and ICOT terms.

Copyright 2000, 2001, 2002, 2003 Nara Institute of Science
and Technology.  All Rights Reserved.

Use, reproduction, and distribution of this software is permitted.
Any copy of this software, whether in its original form or modified,
must include both the above copyright notice and the following
paragraphs.

Nara Institute of Science and Technology (NAIST),
the copyright holders, disclaims all warranties with regard to this
software, including all implied warranties of merchantability and
fitness, in no event shall NAIST be liable for
any special, indirect or consequential damages or any damages
whatsoever resulting from loss of use, data or profits, whether in an
action of contract, negligence or other tortuous action, arising out
of or in connection with the use or performance of this software.

A large portion of the dictionary entries
originate from ICOT Free Software.  The following conditions for ICOT
Free Software applies to the current dictionary as well.

Each User may also freely distribute the Program, whether in its
original form or modified, to any third party or parties, PROVIDED
that the provisions of Section 3 ("NO WARRANTY") will ALWAYS appear
on, or be attached to, the Program, which is distributed substantially
in the same form as set out herein and that such intended
distribution, if actually made, will neither violate or otherwise
contravene any of the laws and regulations of the countries having
jurisdiction over the User or the intended distribution itself.

NO WARRANTY

The program was produced on an experimental basis in the course of the
research and development conducted during the project and is provided
to users as so produced on an experimental basis.  Accordingly, the
program is provided without any warranty whatsoever, whether express,
implied, statutory or otherwise.  The term "warranty" used herein
includes, but is not limited to, any warranty of the quality,
performance, merchantability and fitness for a particular purpose of
the program and the nonexistence of any infringement or violation of
any right of any third party.

Each user of the program will agree and understand, and be deemed to
have agreed and understood, that there is no warranty whatsoever for
the program and, accordingly, the entire risk arising from or
otherwise connected with the program is assumed by the user.

Therefore, neither ICOT, the copyright holder, or any other
organization that participated in or was otherwise related to the
development of the program and their respective officials, directors,
officers and other employees shall be held liable for any and all
damages, including, without limitation, general, special, incidental
and consequential damages, arising out of or otherwise in connection
with the use or inability to use the program or any product, material
or result produced or otherwise obtained by using the program,
regardless of whether they have been advised of, or otherwise had
knowledge of, the possibility of such damages at any time during the
project or thereafter.  Each user will be deemed to have agreed to the
foregoing by his or her commencement of use of the program.  The term
"use" as used herein includes, but is not limited to, the use,
modification, copying and distribution of the program and the
production of secondary products from the program.

In the case where the program, whether in its original form or
modified, was distributed or delivered to or received by a user from
any person, organization or entity other than ICOT, unless it makes or
grants independently of ICOT any specific warranty to the user in
writing, such person, organization or entity, will also be exempted
from and not be held liable to the user for any such damages as noted
above as far as the program is concerned.

## UniDic

UniDic 2.1.2 is embedded in `assets/unidic.wasm`. Rubinate distributes it under the **BSD-3-Clause** option offered by the UniDic Consortium. The original distribution's `AUTHORS` identifies the author as “The UniDic Consortium”. Its `COPYING` states:

> unidic-mecab is copyrighted free software by the UniDic Consortium,
> and is released under any of the GPL (see the file GPL), the LGPL (see
> the file LGPL), or the BSD License (see the file BSD).

The following is the selected license text from `BSD`.

Copyright (c) 2011-2013, The UniDic Consortium
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

 * Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.

 * Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the
   distribution.

 * Neither the name of the UniDic Consortium nor the names of its
   contributors may be used to endorse or promote products derived
   from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## Furigana data

[JmdictFurigana and JmnedictFurigana](https://github.com/Doublevil/JmdictFurigana), release `2.3.1+2026-05-25`, provide surface-to-reading correspondence. The data is bundled in `jmdict-furigana/assets/` and embedded in `assets/jmdict_furigana.wasm`.

These resources are derived from JMdict/EDICT and JMnedict/ENAMDICT, maintained by the Electronic Dictionary Research and Development Group (EDRDG). They are distributed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/), the same license as the source dictionaries. See [EDRDG's license and attribution information](https://www.edrdg.org/edrdg/licence.html).

The embedded snapshots were transformed by omitting redundant readings for unambiguous surface forms, sorting and partitioning the records into independently decompressible blocks, and compressing the results with Zstandard.
