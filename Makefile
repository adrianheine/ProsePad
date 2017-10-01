PAGES:=$(shell find pages -name "*.html") $(shell find pages -name "*.md")

EXAMPLES:=collab

ROOT:=$(shell if [ -d node_modules/prosemirror-model ]; then echo node_modules/; else echo ../node_modules/; fi)

all: $(subst .md,.html,$(PAGES:pages/%=public/%)) \
     $(foreach EX,$(EXAMPLES), public/examples/$(EX)/example.js) \
     public/examples/prosemirror.js \
     public/css/editor.css

public/%.html: pages/%.* templates/* src/build/*.js
	mkdir -p $(dir $@)
	node src/build/build.js $<

CORE:=prosemirror-model prosemirror-transform prosemirror-state prosemirror-view \
      prosemirror-keymap prosemirror-inputrules prosemirror-history prosemirror-commands \
      prosemirror-schema-basic prosemirror-schema-list \
      prosemirror-dropcursor prosemirror-menu prosemirror-example-setup

public/examples/prosemirror.js: bin/library.js $(foreach LIB,$(CORE),$(wildcard $(ROOT)$(LIB)/dist/*.js))
	mkdir -p $(dir $@)
	node bin/build-library.js > $@

public/examples/%/example.js: example/%/index.js
	mkdir -p $(dir $@)
	node bin/build-example.js $< > $@

public/css/editor.css: $(ROOT)prosemirror-view/style/prosemirror.css \
                       $(ROOT)prosemirror-menu/style/menu.css \
                       $(ROOT)prosemirror-gapcursor/style/gapcursor.css \
                       $(ROOT)prosemirror-example-setup/style/style.css \
                       public/css/editor-base.css
	cat $^ > $@

clean:
	rm public/**/*.html public/examples/*/example.js public/examples/prosemirror.js public/css/editor.css
