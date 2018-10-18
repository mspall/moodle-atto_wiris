import TextCache from './cache.js';
import MathML from './mathml.js';
import ServiceProvider from './serviceprovider.js';
import Constants from './constants.js';
import Util from './util.js';

/**
 * This class represents a LaTeX parser. Manages the services which allows to convert
 * LaTeX into MathML and MathML into LaTeX.
 */
export default class Latex {
    /**
     * Converts MathML to LaTeX by calling mathml2latex service. For text services
     * we call a text service with the param mathml2latex.
     * @param {string} mathml - MathML String
     * @return {string} LaTeX string generated by the MathML argument.
     */
    static getLatexFromMathML(mathml) {
        /**
         * @type {TextCache}
         */
        let cache = Latex.cache;

        var data = {
            'service': 'mathml2latex',
            'mml': mathml
        };

        var jsonResponse = JSON.parse(ServiceProvider.getService('service', data));

        //TODO: Error handling.
        let latex = '';

        if (jsonResponse.status == "ok") {
            latex = jsonResponse.result.text;
            const latexHtmlEntitiesEncoded = Util.htmlEntities(latex);
            // Inserting LaTeX semantics.
            mathml = MathML.insertSemanticsMathml(mathml, latexHtmlEntitiesEncoded, 'LaTeX');
            cache.populate(latex, mathml);
        }

        return latex;
    }

    /**
     * Converts LaTeX to MathML by calling latex2mathml service. For text services
     * we call a text service with the param latex2mathml.
     * @param {string} latex - string containing a LaTeX formula.
     * @param {boolean} includeLatexOnSemantics - if true LaTeX would me included into MathML semantics.
     * @return {string} MathML string generated by the LaTeX argument.
     */
    static getMathMLFromLatex(latex, includeLatexOnSemantics) {
        /**
         * @type {TextCache}
         */
        let latexCache = Latex.cache;

        if (Latex.cache.get(latex)) {
            return Latex.cache.get(latex);
        }
        var data = {
            'service': 'latex2mathml',
            'latex': latex
        };

        if (includeLatexOnSemantics) {
            data['saveLatex'] = '';
        }

        var jsonResponse = JSON.parse(ServiceProvider.getService('service', data));

        var output;
        if (jsonResponse.status == "ok") {
            let mathml = jsonResponse.result.text;
            mathml = mathml.split("\r").join('').split("\n").join(' ');

            // Populate LatexCache.
            if (mathml.indexOf('semantics') == -1 && mathml.indexOf('annotation') == -1 ) {
                mathml = MathML.insertSemanticsMathml(mathml, latex, 'LaTeX');
                output = mathml;

            } else {
                output = mathml;
            }
            if (!latexCache.get(latex)) {
                latexCache.populate(latex, mathml);
            }


        } else {
            output = "$$" + latex + "$$";
        }
        return output;
    }

    /**
     * Converts all occurrences of MathML code to LaTeX. The MathML code should containing <annotation encoding="LaTeX"/> to be converted.
     * @param {string} content - a string containing MathML valid code.
     * @param {Object} characters - an object containing special characters.
     * @return {string} a string containing all MathML annotated occurrences replaced by the corresponding LaTeX code.
     */
    static parseMathmlToLatex(content, characters) {
        var output = '';
        var mathTagBegin = characters.tagOpener + 'math';
        var mathTagEnd = characters.tagOpener + '/math' + characters.tagCloser;
        var openTarget = characters.tagOpener + 'annotation encoding=' + characters.doubleQuote + 'LaTeX' + characters.doubleQuote + characters.tagCloser;
        var closeTarget = characters.tagOpener + '/annotation' + characters.tagCloser;
        var start = content.indexOf(mathTagBegin);
        var end = 0;
        var mathml, startAnnotation, closeAnnotation;

        while (start != -1) {
            output += content.substring(end, start);
            end = content.indexOf(mathTagEnd, start);

            if (end == -1) {
                end = content.length - 1;
            }
            else {
                end += mathTagEnd.length;
            }

            mathml = content.substring(start, end);

            startAnnotation = mathml.indexOf(openTarget);
            if (startAnnotation != -1){
                startAnnotation += openTarget.length;
                closeAnnotation = mathml.indexOf(closeTarget);
                var latex = mathml.substring(startAnnotation, closeAnnotation);
                if (characters == Constants.safeXmlCharacters) {
                    latex = MathML.safeXmlDecode(latex);
                }
                output += '$$' + latex + '$$';
                // Populate latex into cache.

                Latex.cache.populate(latex, mathml);
            }else{
                output += mathml;
            }

            start = content.indexOf(mathTagBegin, end);
        }

        output += content.substring(end, content.length);
        return output;
    }

    /**
     * Extracts the latex of a determined position in a text.
     * @param {Node} textNode - textNode to extract the LaTeX
     * @param {number} caretPosition - starting position to find LaTeX.
     * @param {Object} latexTags - optional parameter representing tags between latex is inserted. It has the 'open' attribute for the open tag and the 'close' attribute for the close tag.
     * "$$" by default.
     * @return {Object} An object with 3 keys: 'latex', 'start' and 'end'. Null if latex is not found.
     * @static
     */
    static getLatexFromTextNode(textNode, caretPosition, latexTags) {
        // TODO: Set LaTeX Tags as Core variable. Fix the call to this function (third argument).
        // Tags used for LaTeX formulas.
        var defaultLatexTags = {
            'open': '$$',
            'close': '$$'
        };
        // latexTags is an optional parameter. If is not set, use default latexTags.
        if (typeof latexTags == 'undefined' || latexTags == null) {
            latexTags = defaultLatexTags;
        }
        // Looking for the first textNode.
        var startNode = textNode;

        while (startNode.previousSibling && startNode.previousSibling.nodeType == 3) { // TEXT_NODE.
            startNode = startNode.previousSibling;
        }

        // Finding latex.

        /**
         * Returns the next latex position and node from a specific node and position.
         * @param {Node} currentNode - node where searching latex.
         * @param {number} currentPosition - current position inside the currentNode.
         * @param {Object} latexTagsToUse - tags used at latex beginning and latex final. "$$" by default.
         * @param {boolean} tag - tag containing the current search.
         * @returns {object} object containing the current node and the position.
         */
        function getNextLatexPosition(currentNode, currentPosition, tag) {

            var position = currentNode.nodeValue.indexOf(tag, currentPosition);

            while (position == -1) {
                currentNode = currentNode.nextSibling;

                if (!currentNode) { // TEXT_NODE.
                    return null; // Not found.
                }

                position = currentNode.nodeValue ? currentNode.nodeValue.indexOf(latexTags.close) : -1;
            }

            return {
                'node': currentNode,
                'position': position
            };
        }

        /**
         * Determines if a node is previous, or not, to a second one.
         * @param {Node} node - start node.
         * @param {number} position - start node position.
         * @param {Node} endNode - end node.
         * @param {number} endPosition - end node position.
         * @returns {boolean} true if the starting node is previous thant the en node. false otherwise.
         */
        function isPrevious(node, position, endNode, endPosition) {
            if (node == endNode) {
                return (position <= endPosition);
            }

            while (node && node != endNode) {
                node = node.nextSibling;
            }

            return (node == endNode);
        }

        var start;
        var end = {
            'node': startNode,
            'position': 0
        };
        // Is supposed that open and close tags has the same length.
        var tagLength = latexTags.open.length;
        do {
            var start = getNextLatexPosition(end.node, end.position, latexTags.open);

            if (start == null || isPrevious(textNode, caretPosition, start.node, start.position)) {
                return null;
            }

            var end = getNextLatexPosition(start.node, start.position + tagLength, latexTags.close);

            if (end == null) {
                return null;
            }

            end.position += tagLength;
        } while (isPrevious(end.node, end.position, textNode, caretPosition));

        // Isolating latex.
        var latex;

        if (start.node == end.node) {
            latex = start.node.nodeValue.substring(start.position + tagLength, end.position - tagLength);
        }
        else {
            latex = start.node.nodeValue.substring(start.position + tagLength, start.node.nodeValue.length);
            var currentNode = start.node;

            do {
                currentNode = currentNode.nextSibling;

                if (currentNode == end.node) {
                    latex += end.node.nodeValue.substring(0, end.position - tagLength);
                }
                else {
                    latex += currentNode.nodeValue ? currentNode.nodeValue : '';
                }
            } while (currentNode != end.node);
        }

        return {
            'latex': latex,
            'startNode': start.node,
            'startPosition': start.position,
            'endNode': end.node,
            'endPosition': end.position
        };
    }
}

/**
 * Text cache. Stores all processed LaTeX strings and it's correspondent MathML string.
 * @type {Cache}
 * @static
 */
Latex.cache = new TextCache();
